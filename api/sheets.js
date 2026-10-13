/**
 * BY Sirius — Sıra Nova Google Sheet köprüsü (admin paneli için)
 *
 * Sıra Nova botu müşteri / yapılacak / hedef / takvim kayıtlarını bir Google Sheet'e yazar.
 * Bu endpoint aynı Sheet'i panelden okur ve düzenler (tek veri kaynağı).
 *
 * Vercel env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — botun google-credentials.json dosyasının TÜM içeriği
 *   GOOGLE_SHEETS_ID            — Sheet URL'sindeki ID (botun .env.local'indeki ile aynı)
 *
 * GET  /api/sheets                       → tüm sekmeler
 * POST /api/sheets {action:'add',    tab, icerik, not, durum}
 * POST /api/sheets {action:'update', tab, row, expect, icerik, not, durum}
 * POST /api/sheets {action:'delete', tab, row, expect}
 *
 * Sütunlar: A Tarih | B Icerik | C Tamamlandı | D Devam Ediyor | E İptal | F Not   (botla ortak)
 *           G Öncelik | H Termin                                                    (panel ekler; bot dokunmaz)
 */
import { guard, json } from './_auth.js';

export const config = { runtime: 'edge' };

const TABS = ['Musteriler', 'Yapilacaklar', 'Hedefler', 'Takvim'];
const DURUMLAR = { tamamlandi: [true, false, false], devam: [false, true, false], iptal: [false, false, true] };
const ONCELIKLER = ['Yüksek', 'Normal', 'Düşük'];
const TERMIN_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const enc = new TextEncoder();

// ── Google servis hesabı → access token ──────────────────────────────────────
let cachedToken = null;

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function accessToken(sa) {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))) + '.' +
    b64url(enc.encode(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600
    })));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google yetkilendirme hatası: ' + (data.error_description || data.error));
  cachedToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function gfetch(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Sheets API ${res.status}`);
  return data;
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
const isTrue = v => v === true || String(v).toUpperCase() === 'TRUE';

function toRecord(r, row) {
  const durum = isTrue(r[2]) ? 'tamamlandi' : isTrue(r[4]) ? 'iptal' : 'devam';
  return {
    row, tarih: r[0] || '', icerik: r[1] || '', durum, not: r[5] || '',
    oncelik: ONCELIKLER.includes(r[6]) ? r[6] : 'Normal',
    termin: TERMIN_RE.test(r[7] || '') ? r[7] : ''
  };
}

function nowTR() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map(x => [x.type, x.value])
  );
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

const range = (tab, a1) => encodeURIComponent(`${tab}!${a1}`);

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req) {
  const denied = await guard(req);
  if (denied) return denied;

  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!saRaw || !sheetId) {
    return json({
      error: 'Sheet bağlantısı yapılandırılmadı.',
      missing: [!saRaw && 'GOOGLE_SERVICE_ACCOUNT_JSON', !sheetId && 'GOOGLE_SHEETS_ID'].filter(Boolean)
    }, 503);
  }

  try {
    const sa = JSON.parse(saRaw);
    const token = await accessToken(sa);
    const base = `${SHEETS}/${sheetId}`;

    if (req.method === 'GET') {
      const q = TABS.map(t => `ranges=${range(t, 'A2:H')}`).join('&');
      const data = await gfetch(token, `${base}/values:batchGet?${q}`);
      const tabs = {};
      TABS.forEach((t, i) => {
        const rows = data.valueRanges?.[i]?.values || [];
        tabs[t] = rows.map((r, idx) => toRecord(r, idx + 2)).filter(x => x.icerik);
      });
      return json({ tabs, fetchedAt: new Date().toISOString() });
    }

    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

    const b = await req.json();
    if (!TABS.includes(b.tab)) return json({ error: 'Geçersiz liste' }, 400);
    const tab = b.tab;

    if (b.action === 'add' || b.action === 'update') {
      const icerik = String(b.icerik || '').trim().slice(0, 500);
      const not = String(b.not || '').trim().slice(0, 2000);
      if (!icerik) return json({ error: 'İçerik boş olamaz' }, 400);
      const flags = DURUMLAR[b.durum] || DURUMLAR.devam;
      const oncelik = ONCELIKLER.includes(b.oncelik) ? b.oncelik : 'Normal';
      const termin = String(b.termin || '').replace('T', ' ').trim();
      if (termin && !TERMIN_RE.test(termin)) return json({ error: 'Termin biçimi geçersiz' }, 400);
      await ensureHeaders(token, base, tab);

      if (b.action === 'add') {
        await gfetch(token,
          `${base}/values/${range(tab, 'A:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          { method: 'POST', body: JSON.stringify({ values: [[nowTR(), icerik, ...flags, not, oncelik, termin]] }) });
        return json({ success: true });
      }

      const row = await verifyRow(token, base, tab, b);
      if (row instanceof Response) return row;
      await gfetch(token,
        `${base}/values/${range(tab, `B${row}:H${row}`)}?valueInputOption=RAW`,
        { method: 'PUT', body: JSON.stringify({ values: [[icerik, ...flags, not, oncelik, termin]] }) });
      return json({ success: true });
    }

    if (b.action === 'delete') {
      const row = await verifyRow(token, base, tab, b);
      if (row instanceof Response) return row;
      const meta = await gfetch(token, `${base}?fields=sheets.properties(sheetId,title)`);
      const sheet = meta.sheets?.find(s => s.properties.title === tab);
      if (!sheet) return json({ error: 'Sekme bulunamadı' }, 404);
      await gfetch(token, `${base}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ deleteDimension: {
          range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row }
        } }] })
      });
      return json({ success: true });
    }

    return json({ error: 'Bilinmeyen işlem' }, 400);
  } catch (err) {
    return json({ error: err.message || 'Sunucu hatası' }, 500);
  }
}

// Sekmede G:H sütunlarını (Öncelik / Termin) hazırlar: bot sekmeyi 6 sütunla açtığı için önce ızgarayı genişletir.
const headerDone = new Set();
async function ensureHeaders(token, base, tab) {
  if (headerDone.has(tab)) return;
  const meta = await gfetch(token, `${base}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
  const sheet = meta.sheets?.find(s => s.properties.title === tab);
  if (!sheet) throw new Error('Sekme bulunamadı: ' + tab);
  if ((sheet.properties.gridProperties?.columnCount || 0) < 8) {
    await gfetch(token, `${base}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ updateSheetProperties: {
        properties: { sheetId: sheet.properties.sheetId, gridProperties: { columnCount: 8 } },
        fields: 'gridProperties.columnCount'
      } }] })
    });
  }
  const data = await gfetch(token, `${base}/values/${range(tab, 'G1:H1')}`);
  if (!data.values?.[0]?.[0]) {
    await gfetch(token, `${base}/values/${range(tab, 'G1:H1')}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [['Öncelik', 'Termin']] }) });
  }
  headerDone.add(tab);
}

// Satır numarası bot yeni kayıt/silme yaptıkça kayabilir: işlemden önce içeriği doğrula.
async function verifyRow(token, base, tab, b) {
  const row = Number(b.row);
  if (!Number.isInteger(row) || row < 2 || row > 5000) return json({ error: 'Geçersiz satır' }, 400);
  const data = await gfetch(token, `${base}/values/${range(tab, `B${row}`)}`);
  const current = (data.values?.[0]?.[0] || '').trim();
  if (current !== String(b.expect || '').trim()) {
    return json({ error: 'Liste bu arada değişti (bot yeni kayıt eklemiş olabilir). Yenileyip tekrar deneyin.' }, 409);
  }
  return row;
}
