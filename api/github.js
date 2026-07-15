/**
 * BY Sirius — GitHub file proxy
 * GET  /api/github?file=products.json        → reads file from GitHub repo
 * POST /api/github?file=products.json        → commits updated file (requires admin auth)
 *
 * Required Vercel env vars (for write):
 *   GITHUB_TOKEN   — GitHub Personal Access Token (repo: contents write)
 *   ADMIN_PASSWORD — same as CRM admin password
 */

export const config = { runtime: 'edge' };

const OWNER  = 'ozgunustuay-sirius';
const REPO   = 'bysirius.com';
const BRANCH = 'main';

const ALLOWED = /^([\w\-]+\/)*([\w\-]+\.(html|json|txt|js|css|jpg|jpeg|png|gif|webp|svg|ico))$/;

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = new Set(['https://bysirius.com', 'https://www.bysirius.com']);
  return {
    'Access-Control-Allow-Origin':  allowed.has(origin) ? origin : 'https://www.bysirius.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

export default async function handler(req) {
  const CORS = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const url  = new URL(req.url);
  const file = url.searchParams.get('file');

  if (!file || !ALLOWED.test(file) || file.includes('..')) {
    return json({ error: 'Geçersiz dosya yolu' }, 400, CORS);
  }

  const ghToken = process.env.GITHUB_TOKEN;
  const ghHeaders = ghToken ? { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github+json' }
                             : { 'Accept': 'application/vnd.github+json' };

  if (req.method === 'GET') {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${file}?ref=${BRANCH}`,
      { headers: ghHeaders }
    );
    if (!res.ok) return json({ error: 'Dosya bulunamadı' }, 404, CORS);
    const data  = await res.json();
    // Decode base64 → binary bytes → UTF-8 string (fixes Turkish/non-ASCII char corruption)
    const bytes   = Uint8Array.from(atob(data.content.replace(/\n/g,'')), c => c.charCodeAt(0));
    const content = new TextDecoder('utf-8').decode(bytes);
    return new Response(content, {
      headers: { 'Content-Type': guessType(file), ...CORS }
    });
  }

  if (req.method === 'POST') {
    const adminPw = process.env.ADMIN_PASSWORD;
    const auth    = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const ok      = await checkAuth(auth, adminPw);
    if (!ok) return json({ error: 'Yetkisiz erişim' }, 401, CORS);
    if (!ghToken) return json({ error: 'GITHUB_TOKEN env var eksik. Vercel\'de ekleyin.' }, 503, CORS);

    const body    = await req.json();
    const content  = body.content;
    const message  = body.message || `Update ${file} via BY Sirius admin`;
    const isBinary = body.binary === true;

    if (typeof content !== 'string') return json({ error: 'content string olmalı' }, 400, CORS);

    // get current SHA
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${file}?ref=${BRANCH}`,
      { headers: ghHeaders }
    );
    let sha;
    if (getRes.ok) { const d = await getRes.json(); sha = d.sha; }

    // encode to base64: binary files arrive already base64, text files need UTF-8 safe encode
    const b64 = isBinary ? content : btoa(unescape(encodeURIComponent(content)));

    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${file}`,
      {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: b64, branch: BRANCH, ...(sha ? { sha } : {}) })
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      return json({ error: err.message || 'GitHub commit başarısız' }, 500, CORS);
    }

    return json({
      success: true,
      message: `${file} güncellendi. Vercel yeniden deploy ediyor (~30 saniye).`
    }, 200, CORS);
  }

  return json({ error: 'Method Not Allowed' }, 405, CORS);
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

function guessType(file) {
  if (file.endsWith('.json'))             return 'application/json; charset=utf-8';
  if (file.endsWith('.html'))             return 'text/html; charset=utf-8';
  if (file.match(/\.(jpg|jpeg)$/i))       return 'image/jpeg';
  if (file.endsWith('.png'))              return 'image/png';
  if (file.endsWith('.gif'))              return 'image/gif';
  if (file.endsWith('.webp'))             return 'image/webp';
  if (file.endsWith('.svg'))              return 'image/svg+xml';
  return 'text/plain; charset=utf-8';
}

async function checkAuth(auth, adminPw) {
  if (!auth) return false;
  if (adminPw && auth === adminPw) return true;
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/ozgunustuay-sirius/bysirius.com/main/admin-config.json',
      { signal: AbortSignal.timeout(2000) }
    );
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.passwordHash) {
        const hash = await sha256(auth);
        if (hash === cfg.passwordHash) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
