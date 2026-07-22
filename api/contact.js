export const config = { runtime: 'edge' };

// ─── Soft Rate Limit (in-memory, isolate başına) ────────────────────────────
// Amaç engellemek değil işaretlemek: aynı IP kısa sürede çok submit atarsa
// talep yine işlenir, sadece "şüpheli" olarak etiketlenir.
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 dakika
const RATE_MAX = 3;                    // pencere içinde bu sayının üzeri şüpheli
const ipHits = new Map();

function isRateSuspicious(ip) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 1000) {
    for (const [key, times] of ipHits) {
      if (times.every(t => now - t >= RATE_WINDOW_MS)) ipHits.delete(key);
    }
  }
  return hits.length > RATE_MAX;
}

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

  const { name, email, phone, services, message, formType, contractRef, website } = body;

  const timestamp = new Date().toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // ─── Spam Skorlama (engelleme yok, sadece işaretleme) ─────────────────────
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
          || req.headers.get('x-real-ip')
          || 'bilinmiyor';

  const flags = [];
  if (website) flags.push('honeypot dolu');

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ''));
  if (!emailValid) flags.push('geçersiz e-posta');

  if (!String(name || '').trim()) flags.push('isim boş');

  if (isRateSuspicious(ip)) flags.push(`hız limiti (${RATE_MAX}+ submit / 10 dk, aynı IP)`);

  const suspicious = flags.length > 0;

  // Vercel loglarında kalıcı iz: gerçek trafiğin dağılımını görüp eşik ayarlamak için
  console.log(JSON.stringify({
    tag: 'form-submit',
    suspicious,
    flags,
    ip,
    formType: formType || 'contact',
    email: String(email || '').slice(0, 100),
    ua: (req.headers.get('user-agent') || '').slice(0, 150),
    ts: new Date().toISOString()
  }));

  const results = {};

  // ─── Telegram Bildirimi ───────────────────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    const label = formType === 'analysis'  ? '🔬 Ücretsiz Analiz Talebi'
                : formType === 'sozlesme'  ? '📝 Sözleşme KABUL EDİLDİ'
                : '📩 İletişim Formu';

    const statusTag = suspicious ? '🔴 ŞÜPHELİ' : '🟢 Doğrulanmış';

    const text = [
      `<b>${statusTag} · ${label}</b>`,
      suspicious ? `⚠️ <b>Neden:</b> ${escHtml(flags.join(', '))}` : null,
      '',
      `👤 <b>Ad Soyad:</b> ${escHtml(name)}`,
      `📧 <b>E-posta:</b> ${escHtml(email)}`,
      `📱 <b>Telefon:</b> ${escHtml(phone)}`,
      `🛠 <b>Hizmetler:</b> ${escHtml(services || '—')}`,
      message     ? `💬 <b>Mesaj:</b> ${escHtml(message)}` : null,
      contractRef ? `📋 <b>Sözleşme Ref:</b> ${escHtml(contractRef)}` : null,
      '',
      `🌐 IP: ${escHtml(ip)}`,
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
      `${suspicious ? '🔴 ŞÜPHELİ · ' : '🟢 '}${label} — BY Sirius`,
      suspicious ? `⚠️ Neden: ${flags.join(', ')}` : null,
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
    const subject = `[BY Sirius] ${suspicious ? '🔴 ŞÜPHELİ · ' : ''}${labelMap[formType] || 'Yeni Talep'} — ${escHtml(name)}`;
    const html = `
      <h2 style="font-family:sans-serif;color:#1a1a18">${suspicious ? '🔴 ŞÜPHELİ · ' : ''}${labelMap[formType] || 'Yeni Form Talebi'}</h2>
      ${suspicious ? `<p style="font-family:sans-serif;font-size:13px;color:#c0392b;background:#fdf0ee;padding:8px 12px;border-radius:6px">⚠️ Spam işaretleri: ${escHtml(flags.join(', '))} · IP: ${escHtml(ip)}</p>` : ''}
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
          ...(emailValid ? { reply_to: email } : {}),
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
          kaynak: suspicious ? 'Web Form ⚠️ Şüpheli' : 'Web Form',
          notlar: (suspicious ? `⚠️ Şüpheli: ${flags.join(', ')} | IP: ${ip} | ` : '') + (message || ''),
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
