/**
 * BY Sirius CRM API — Google Sheets backend via Apps Script proxy
 *
 * Vercel Env Vars:
 *   CRM_SCRIPT_URL   — Google Apps Script web app URL (see setup guide below)
 *   CRM_SECRET       — Shared secret (herhangi bir güçlü şifre)
 *   ADMIN_PASSWORD   — Admin panel giriş şifresi
 *
 * ═══════════════════════════════════════════════════════
 * GOOGLE APPS SCRIPT KURULUM (bir kez yapılır):
 * ─────────────────────────────────────────────────────
 * 1. drive.google.com → Yeni Google E-Tablosu oluşturun, adı "BY Sirius CRM"
 * 2. Sayfa adını "CRM" olarak değiştirin (alt sekmede sağ tıklayın)
 * 3. Satır 1'e şu başlıkları yazın (A1'den başlayarak):
 *    id | firma_adi | yetkili | email | telefon | whatsapp | hizmetler |
 *    durum | kaynak | notlar | randevu | tutar | olusturma | guncelleme
 * 4. Uzantılar → Apps Script menüsünü açın
 * 5. Aşağıdaki kodu yapıştırın (dosya adı: Code.gs):
 *
 * ─── Apps Script Code (Code.gs) ───────────────────────
 *
 * const SHEET_NAME = 'CRM';
 *
 * function getSecret() {
 *   return PropertiesService.getScriptProperties().getProperty('SECRET');
 * }
 *
 * function doGet(e) {
 *   if (e.parameter.secret !== getSecret()) return err('Unauthorized');
 *   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
 *   if (e.parameter.action === 'list') return listAll(sheet);
 *   if (e.parameter.action === 'stats') return stats(sheet);
 *   return err('Unknown action');
 * }
 *
 * function doPost(e) {
 *   if (e.parameter.secret !== getSecret()) return err('Unauthorized');
 *   const data = JSON.parse(e.postData.contents);
 *   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
 *   if (e.parameter.action === 'add')    return addRow(sheet, data);
 *   if (e.parameter.action === 'update') return updateRow(sheet, data);
 *   if (e.parameter.action === 'delete') return deleteRow(sheet, data.id);
 *   return err('Unknown action');
 * }
 *
 * function listAll(sheet) {
 *   const rows = sheet.getDataRange().getValues();
 *   if (rows.length <= 1) return ok({ records: [] });
 *   const headers = rows[0];
 *   const records = rows.slice(1).map(r => Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
 *   return ok({ records });
 * }
 *
 * function stats(sheet) {
 *   const rows = sheet.getDataRange().getValues().slice(1);
 *   const total = rows.length;
 *   const aktif = rows.filter(r => r[7] === 'Aktif').length;
 *   const potansiyel = rows.filter(r => r[7] === 'Potansiyel').length;
 *   const bugun = new Date().toDateString();
 *   const randevu = rows.filter(r => r[10] && new Date(r[10]).toDateString() === bugun).length;
 *   return ok({ total, aktif, potansiyel, randevu });
 * }
 *
 * function addRow(sheet, d) {
 *   const id = Utilities.getUuid();
 *   const now = new Date().toISOString();
 *   sheet.appendRow([id, d.firma_adi, d.yetkili, d.email, d.telefon, d.whatsapp,
 *     d.hizmetler, d.durum||'Potansiyel', d.kaynak||'Manuel', d.notlar,
 *     d.randevu, d.tutar, now, now]);
 *   return ok({ id });
 * }
 *
 * function updateRow(sheet, d) {
 *   const rows = sheet.getDataRange().getValues();
 *   for (let i = 1; i < rows.length; i++) {
 *     if (rows[i][0] === d.id) {
 *       const now = new Date().toISOString();
 *       sheet.getRange(i+1, 2, 1, 13).setValues([[
 *         d.firma_adi, d.yetkili, d.email, d.telefon, d.whatsapp,
 *         d.hizmetler, d.durum, d.kaynak, d.notlar, d.randevu, d.tutar,
 *         rows[i][12], now
 *       ]]);
 *       return ok({ updated: true });
 *     }
 *   }
 *   return err('Not found');
 * }
 *
 * function deleteRow(sheet, id) {
 *   const rows = sheet.getDataRange().getValues();
 *   for (let i = 1; i < rows.length; i++) {
 *     if (rows[i][0] === id) { sheet.deleteRow(i+1); return ok({ deleted: true }); }
 *   }
 *   return err('Not found');
 * }
 *
 * function ok(d)  { return ContentService.createTextOutput(JSON.stringify({success:true,...d})).setMimeType(ContentService.MimeType.JSON); }
 * function err(m) { return ContentService.createTextOutput(JSON.stringify({success:false,error:m})).setMimeType(ContentService.MimeType.JSON); }
 *
 * ─── Apps Script Deployment ────────────────────────────
 * 6. Proje Özellikleri → Komut Dosyası Özellikleri → "SECRET" anahtarıyla
 *    CRM_SECRET değerinizi ekleyin
 * 7. Deploy → New deployment → Web app
 *    Execute as: Me | Who has access: Anyone
 * 8. Oluşturulan URL'yi Vercel'e CRM_SCRIPT_URL olarak ekleyin
 * ═══════════════════════════════════════════════════════
 */

export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = new Set(['https://bysirius.com', 'https://www.bysirius.com']);

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allow  = ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.bysirius.com';
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

export default async function handler(req) {
  const CORS = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  const adminPw    = process.env.ADMIN_PASSWORD;
  const crmSecret  = process.env.CRM_SECRET;
  const crmUrl     = process.env.CRM_SCRIPT_URL;

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  // Auth: admin password OR internal CRM secret
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!adminPw || (auth !== adminPw && auth !== crmSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!crmUrl) {
    return json({ error: 'CRM henüz yapılandırılmadı. CRM_SCRIPT_URL env var eksik.' }, 503);
  }

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') || 'list';

  try {
    if (req.method === 'GET') {
      const res  = await fetch(`${crmUrl}?secret=${crmSecret}&action=${action}`);
      const data = await res.json();
      return json(data);
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const res  = await fetch(`${crmUrl}?secret=${crmSecret}&action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return json(data);
    }

    return json({ error: 'Method Not Allowed' }, 405);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
