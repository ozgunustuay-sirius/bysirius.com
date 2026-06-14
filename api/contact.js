export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { name, email, phone, services, message, formType, contractRef } = body;

  const timestamp = new Date().toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const results = {};

  // ─── Telegram Bildirimi ───────────────────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    const label = formType === 'analysis'  ? '🔬 Ücretsiz Analiz Talebi'
                : formType === 'sozlesme'  ? '📝 Sözleşme KABUL EDİLDİ'
                : '📩 İletişim Formu';

    const text = [
      `<b>${label}</b>`,
      '',
      `👤 <b>Ad Soyad:</b> ${escHtml(name)}`,
      `📧 <b>E-posta:</b> ${escHtml(email)}`,
      `📱 <b>Telefon:</b> ${escHtml(phone)}`,
      `🛠 <b>Hizmetler:</b> ${escHtml(services || '—')}`,
      message     ? `💬 <b>Mesaj:</b> ${escHtml(message)}` : null,
      contractRef ? `📋 <b>Sözleşme Ref:</b> ${escHtml(contractRef)}` : null,
      '',
      `⏰ ${timestamp}`
    ].filter(Boolean).join('\n');

    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
        }
      );
      results.telegram = tgRes.ok;
    } catch {
      results.telegram = false;
    }
  }

  // ─── WhatsApp Business (Meta Cloud API) ───────────────────────────────────
  const waToken     = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhoneId   = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const waRecipient = (process.env.WHATSAPP_RECIPIENT || '905355032634').replace(/\D/g, '');

  if (waToken && waPhoneId) {
    const label = formType === 'sozlesme' ? '📝 Sözleşme KABUL EDİLDİ'
                : formType === 'analysis' ? '🔬 Ücretsiz Analiz Talebi'
                : '📩 Yeni Form Talebi';

    const waText = [
      `${label} — BY Sirius`,
      '',
      `👤 ${name}`,
      `📧 ${email}`,
      `📱 ${phone}`,
      `🛠 ${services || '—'}`,
      message     ? `💬 ${message}` : null,
      contractRef ? `📋 Ref: ${contractRef}` : null,
      '',
      `⏰ ${timestamp}`
    ].filter(Boolean).join('\n');

    try {
      const waRes = await fetch(
        `https://graph.facebook.com/v20.0/${waPhoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${waToken}`
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: waRecipient,
            type: 'text',
            text: { body: waText }
          })
        }
      );
      results.whatsapp = waRes.ok;
    } catch {
      results.whatsapp = false;
    }
  }

  // ─── E-posta (Resend) ─────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const labelMap = { analysis: 'Ücretsiz Analiz Talebi', sozlesme: '⚡ Sözleşme KABUL EDİLDİ' };
    const subject = `[BY Sirius] ${labelMap[formType] || 'Yeni Talep'} — ${escHtml(name)}`;
    const html = `
      <h2 style="font-family:sans-serif;color:#1a1a18">${labelMap[formType] || 'Yeni Form Talebi'}</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Ad Soyad</td><td>${escHtml(name)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">E-posta</td><td>${escHtml(email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Telefon</td><td>${escHtml(phone)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Hizmetler</td><td>${escHtml(services || '—')}</td></tr>
        ${message     ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">Mesaj</td><td>${escHtml(message)}</td></tr>` : ''}
        ${contractRef ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Sözleşme Ref</td><td>${escHtml(contractRef)}</td></tr>` : ''}
      </table>
      <p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:24px">${timestamp} · bysirius.com</p>
    `;

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`
        },
        body: JSON.stringify({
          from: 'BY Sirius Formlar <noreply@bysirius.com>',
          to: ['ozgun.ustuay@bysirius.com'],
          reply_to: email,
          subject,
          html
        })
      });
      results.email = emailRes.ok;
    } catch {
      results.email = false;
    }
  }

  // ─── CRM: Otomatik Lead Kaydı ─────────────────────────────────────────────
  const crmUrl    = process.env.CRM_SCRIPT_URL;
  const crmSecret = process.env.CRM_SECRET;

  if (crmUrl && crmSecret && formType !== 'sozlesme') {
    try {
      await fetch(`${crmUrl}?secret=${crmSecret}&action=add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firma_adi: name,
          yetkili: name,
          email,
          telefon: phone,
          whatsapp: phone,
          hizmetler: services || '',
          durum: 'Potansiyel',
          kaynak: 'Web Form',
          notlar: message || '',
          randevu: '',
          tutar: ''
        })
      });
      results.crm = true;
    } catch {
      results.crm = false;
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
