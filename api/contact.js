export const config = { runtime: 'edge' };

/* ═══════════════════════════════════════════════════════════════════════════
   BY Sirius — Form Güvenlik Katmanları
   ───────────────────────────────────────────────────────────────────────────
   Her sinyal bir puan üretir. Toplam puana göre üç sonuç:
     puan >= BLOCK_SCORE    → sessiz red (bildirim/CRM yok, sadece log)
     puan >= SUSPECT_SCORE  → teslim edilir ama 🔴 ŞÜPHELİ işaretiyle
     altı                   → 🟢 temiz
   "Sessiz red": bota 200 OK döner, reddedildiğini anlayamaz.
   ═════════════════════════════════════════════════════════════════════════ */

const BLOCK_SCORE   = 5;
const SUSPECT_SCORE = 2;

// Katman 0 — Origin allowlist
const ALLOWED_HOSTS = ['bysirius.com', 'www.bysirius.com', 'localhost', '127.0.0.1'];
const ALLOW_VERCEL_PREVIEW = true;               // *.vercel.app önizleme dağıtımları

// Katman 2 — Rate limit pencereleri
const RATE_WINDOW_MS = 10 * 60 * 1000;           // 10 dakika
const IP_SOFT_MAX    = 3;                        // aynı IP: bu sayıyı aşınca şüpheli
const IP_HARD_MAX    = 6;                        // aynı IP: bu sayıyı aşınca red
const EMAIL_SOFT_AT  = 2;                        // aynı e-posta: 2. gönderim şüpheli
const EMAIL_HARD_AT  = 3;                        // aynı e-posta: 3. gönderim red

// Katman 3 — Doldurma süresi
const MIN_FILL_MS     = 3000;                    // 3 sn altı = bot
const MAX_FORM_AGE_MS = 12 * 60 * 60 * 1000;     // 12 saatten eski sayfa = şüpheli

// Katman 4 — Tor exit node listesi
const TOR_LIST_URL = 'https://check.torproject.org/torbulkexitlist';
const TOR_TTL_MS   = 6 * 60 * 60 * 1000;         // 6 saatte bir tazele
const TOR_FETCH_TIMEOUT_MS = 2500;

// Alan uzunluk sınırları (şişirilmiş payload koruması)
const MAX_LEN = { name: 120, email: 160, phone: 40, services: 400, message: 4000, contractRef: 80 };
const MAX_BODY_BYTES = 20 * 1024;

// Engellenen talepler için özet uyarı sıklığı (bildirim seli olmasın)
const BLOCK_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

/* ─── Katman 0: Origin / Referer doğrulama ──────────────────────────────── */

function hostAllowed(host) {
  if (!host) return false;
  const h = host.toLowerCase().split(':')[0];
  if (ALLOWED_HOSTS.includes(h)) return true;
  if (ALLOW_VERCEL_PREVIEW && h.endsWith('.vercel.app')) return true;
  return false;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/* ─── Katman 2: Rate limit (IP + e-posta) ───────────────────────────────── */

const ipHits    = new Map();
const emailHits = new Map();

function hitCount(store, key) {
  if (!key) return 0;
  const now = Date.now();
  const hits = (store.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  hits.push(now);
  store.set(key, hits);
  if (store.size > 2000) {
    for (const [k, times] of store) {
      if (times.every(t => now - t >= RATE_WINDOW_MS)) store.delete(k);
    }
  }
  return hits.length;
}

// Gmail nokta/artı varyantlarını tek anahtara indirger:
// ozu.fax.ul30+x@gmail.com → ozufaxul30@gmail.com
function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  let local  = s.slice(0, at);
  let domain = s.slice(at + 1);
  local = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local  = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return local + '@' + domain;
}

/* ─── Katman 4: Tor exit node tespiti ───────────────────────────────────── */

const torCache = { ips: null, at: 0, loading: null };

async function loadTorList() {
  const ctl   = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TOR_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(TOR_LIST_URL, { signal: ctl.signal });
    if (!res.ok) throw new Error('tor list HTTP ' + res.status);
    const txt = await res.text();
    const set = new Set();
    for (const line of txt.split('\n')) {
      const ip = line.trim();
      if (ip && !ip.startsWith('#')) set.add(ip);
    }
    if (set.size === 0) throw new Error('tor list bos');
    torCache.ips = set;
    torCache.at  = Date.now();
  } catch (err) {
    // Liste alınamadıysa açık düş (fail-open), 5 dk sonra tekrar dene
    torCache.at = Date.now() - TOR_TTL_MS + 5 * 60 * 1000;
    console.log(JSON.stringify({ tag: 'tor-list-error', error: String(err) }));
  } finally {
    clearTimeout(timer);
  }
}

async function isTorExit(ip) {
  if (!ip || ip === 'bilinmiyor') return false;
  const stale = !torCache.ips || Date.now() - torCache.at > TOR_TTL_MS;
  if (stale && !torCache.loading) {
    torCache.loading = loadTorList().finally(() => { torCache.loading = null; });
  }
  // İlk yüklemede bekle; elde eski liste varsa bekleme (stale-while-revalidate)
  if (!torCache.ips && torCache.loading) {
    try { await torCache.loading; } catch { /* yut */ }
  }
  return torCache.ips ? torCache.ips.has(ip) : false;
}

// Opsiyonel: proxycheck.io ile VPN/proxy/datacenter tespiti.
// PROXYCHECK_API_KEY tanımlıysa çalışır, yoksa sessizce atlanır.
async function isProxyOrVpn(ip) {
  const key = process.env.PROXYCHECK_API_KEY;
  if (!key || !ip || ip === 'bilinmiyor') return false;
  try {
    const ctl   = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2000);
    const res   = await fetch(
      `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${key}&vpn=1&risk=0`,
      { signal: ctl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return false;
    const data  = await res.json();
    const entry = data && data[ip];
    return !!(entry && (entry.proxy === 'yes' || entry.type === 'VPN'));
  } catch {
    return false;
  }
}

/* ─── Katman 5: Cloudflare Turnstile doğrulama ──────────────────────────── */
// TURNSTILE_SECRET_KEY tanımlı değilse bu katman atlanır (site bozulmaz).

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { enabled: false, ok: true };
  if (!token)  return { enabled: true, ok: false, reason: 'token yok' };
  try {
    const form = new URLSearchParams({ secret, response: String(token).slice(0, 2048) });
    if (ip && ip !== 'bilinmiyor') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const data = await res.json();
    return { enabled: true, ok: !!data.success, reason: (data['error-codes'] || []).join(',') };
  } catch {
    // Cloudflare'a ulaşılamıyorsa gerçek kullanıcıyı cezalandırma
    return { enabled: true, ok: true, reason: 'dogrulama servisi kapali' };
  }
}

/* ─── Katman 6: İsim örüntü analizi ─────────────────────────────────────── */

const VOWELS = new Set(['a','e','ı','i','o','ö','u','ü','â','î','û','ê','é','è','á','à','y']);

// Analiz kelime kelime yapılır. Tüm ismi birleştirmek "Hans Schmidt" gibi
// gerçek isimlerde yapay ünsüz zincirleri üretir (…nsSchm…) ve yanlış alarm verir.
function nameSignals(rawName) {
  const out  = { runMax: 0, vowellessWord: false, letters: 0, hasQWX: false, nonLatin: false };
  const name = String(rawName || '').toLowerCase().normalize('NFC');

  out.nonLatin = /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Arabic}]/u.test(name);

  for (const rawWord of name.split(/[^\p{L}]+/u)) {
    const word = rawWord;
    if (!word) continue;
    out.letters += word.length;
    if (/[qwx]/.test(word)) out.hasQWX = true;

    let run = 0, vowels = 0;
    for (const ch of word) {
      if (VOWELS.has(ch)) { vowels++; run = 0; }
      else { run++; if (run > out.runMax) out.runMax = run; }
    }
    if (vowels === 0 && word.length >= 4) out.vowellessWord = true;
  }
  return out;
}

/* ─── Yardımcılar ───────────────────────────────────────────────────────── */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(value, max) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

let lastBlockAlertAt  = 0;
let blockedSinceAlert = 0;

async function notifyBlockDigest(sample) {
  blockedSinceAlert++;
  const now = Date.now();
  if (now - lastBlockAlertAt < BLOCK_ALERT_COOLDOWN_MS) return;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const count = blockedSinceAlert;
  lastBlockAlertAt  = now;
  blockedSinceAlert = 0;

  const text = [
    '<b>🛡 Bot koruması: engellenen form gönderimi</b>',
    `Son dönemde <b>${count}</b> gönderim otomatik reddedildi.`,
    `Örnek — IP: ${escHtml(sample.ip)} · Puan: ${sample.score}`,
    `Nedenler: ${escHtml(sample.flags.join(', '))}`,
    '',
    '<i>Bu özet en fazla 30 dakikada bir gönderilir.</i>'
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch { /* yut */ }
}

function corsHeaders(origin) {
  const h = {
    'Content-Type': 'application/json',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
  if (origin && hostAllowed(hostOf(origin))) {
    h['Access-Control-Allow-Origin']  = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return h;
}

/* ═══ Handler ═══════════════════════════════════════════════════════════ */

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response('Payload Too Large', { status: 413 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return new Response('Bad Request', { status: 400 });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
          || req.headers.get('x-real-ip')
          || 'bilinmiyor';
  const ua      = (req.headers.get('user-agent') || '').slice(0, 200);
  const referer = req.headers.get('referer') || '';

  const name        = clamp(body.name, MAX_LEN.name);
  const email       = clamp(body.email, MAX_LEN.email);
  const phone       = clamp(body.phone, MAX_LEN.phone);
  const services    = clamp(body.services, MAX_LEN.services);
  const message     = clamp(body.message, MAX_LEN.message);
  const contractRef = clamp(body.contractRef, MAX_LEN.contractRef);
  const formType    = String(body.formType || 'contact').slice(0, 30);
  const honeypot    = body.website;
  const elapsedMs   = Number(body.elapsedMs);
  const renderedAt  = Number(body.renderedAt);

  const flags = [];
  let score = 0;
  const add = (points, label) => { score += points; flags.push(label); };

  /* Katman 0 — Origin */
  if (origin) {
    if (!hostAllowed(hostOf(origin))) add(5, `yabanci origin (${hostOf(origin) || 'gecersiz'})`);
  } else if (referer) {
    if (!hostAllowed(hostOf(referer))) add(5, `yabanci referer (${hostOf(referer) || 'gecersiz'})`);
  } else {
    add(4, 'origin/referer yok (tarayici disi istek)');
  }

  /* Katman 1 — Honeypot */
  if (honeypot) add(5, 'honeypot dolu');

  /* Katman 3 — Doldurma süresi */
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    if (elapsedMs < MIN_FILL_MS) {
      add(5, `form ${(elapsedMs / 1000).toFixed(1)} sn icinde dolduruldu (<${MIN_FILL_MS / 1000} sn)`);
    }
  } else {
    add(2, 'zaman damgasi yok');
  }
  if (Number.isFinite(renderedAt) && renderedAt > 0) {
    const age = Date.now() - renderedAt;
    if (age < -60000) add(3, 'zaman damgasi gelecekte');
    else if (age > MAX_FORM_AGE_MS) add(1, 'sayfa 12 saatten eski');
  }

  /* Temel alan doğrulama */
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!emailValid)  add(3, 'gecersiz e-posta');
  if (!name.trim()) add(2, 'isim bos');

  /* Katman 2 — Rate limit (IP) */
  const ipCount = hitCount(ipHits, ip);
  if (ipCount > IP_HARD_MAX)      add(5, `IP hiz limiti asildi (${ipCount} gonderim / 10 dk)`);
  else if (ipCount > IP_SOFT_MAX) add(3, `IP yogunlugu (${ipCount} gonderim / 10 dk)`);

  /* Katman 2 — Rate limit (e-posta) */
  if (emailValid) {
    const emailCount = hitCount(emailHits, normalizeEmail(email));
    if (emailCount >= EMAIL_HARD_AT)      add(5, `ayni e-posta ${emailCount}. kez (10 dk)`);
    else if (emailCount >= EMAIL_SOFT_AT) add(2, `ayni e-posta ${emailCount}. kez (10 dk)`);
  }

  /* Katman 6 — İsim örüntüsü */
  const sig = nameSignals(name);
  if (sig.letters >= 4) {
    if (sig.runMax >= 5)               add(4, `ardisik ${sig.runMax} unsuz harf`);
    if (sig.vowellessWord)             add(3, 'sesli harf icermeyen kelime');
    if (sig.hasQWX && sig.runMax >= 3) add(1, 'Turkcede olmayan harf + unsuz yigilmasi');
    if (sig.nonLatin)                  add(2, 'Latin disi alfabe');
  }
  const linkCount = (message.match(/https?:\/\/|\[url|<a\s/gi) || []).length;
  if (linkCount >= 2) add(2, `mesajda ${linkCount} baglanti`);

  /* Katman 4 — Tor / VPN */
  const [tor, vpn] = await Promise.all([isTorExit(ip), isProxyOrVpn(ip)]);
  if (tor) add(4, 'Tor exit node');
  if (vpn) add(2, 'VPN / proxy IP');

  /* Katman 5 — Turnstile */
  const turnstile = await verifyTurnstile(body.turnstileToken, ip);
  if (turnstile.enabled && !turnstile.ok) {
    add(5, `Turnstile dogrulamasi basarisiz (${turnstile.reason || '-'})`);
  }

  const blocked    = score >= BLOCK_SCORE;
  const suspicious = !blocked && score >= SUSPECT_SCORE;

  console.log(JSON.stringify({
    tag: 'form-submit',
    decision: blocked ? 'blocked' : suspicious ? 'suspicious' : 'clean',
    score,
    flags,
    ip,
    formType,
    email: email.slice(0, 100),
    ua,
    ts: new Date().toISOString()
  }));

  // ─── Sessiz red: bildirim yok, CRM yok, bota normal cevap ────────────────
  if (blocked) {
    await notifyBlockDigest({ ip, score, flags });
    return new Response(JSON.stringify({ success: true, results: {} }), {
      status: 200,
      headers: corsHeaders(origin)
    });
  }

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

    const statusTag = suspicious ? '🔴 ŞÜPHELİ' : '🟢 Doğrulanmış';

    const text = [
      `<b>${statusTag} · ${label}</b>`,
      suspicious ? `⚠️ <b>Neden:</b> ${escHtml(flags.join(', '))} (puan ${score})` : null,
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
    const subject = `[BY Sirius] ${suspicious ? '🔴 ŞÜPHELİ · ' : ''}${labelMap[formType] || 'Yeni Talep'} — ${name}`;
    const html = `
      <h2 style="font-family:sans-serif;color:#1a1a18">${suspicious ? '🔴 ŞÜPHELİ · ' : ''}${labelMap[formType] || 'Yeni Form Talebi'}</h2>
      ${suspicious ? `<p style="font-family:sans-serif;font-size:13px;color:#c0392b;background:#fdf0ee;padding:8px 12px;border-radius:6px">⚠️ Spam işaretleri (puan ${score}): ${escHtml(flags.join(', '))} · IP: ${escHtml(ip)}</p>` : ''}
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
          ...(emailValid && !suspicious ? { reply_to: email } : {}),
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
          notlar: (suspicious ? `⚠️ Şüpheli (puan ${score}): ${flags.join(', ')} | IP: ${ip} | ` : '') + (message || ''),
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
    headers: corsHeaders(origin)
  });
}
