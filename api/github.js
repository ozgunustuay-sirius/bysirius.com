/**
 * BY Sirius — GitHub file proxy
 * GET  /api/github?file=products.json        → reads file from GitHub repo (admin session required)
 * POST /api/github?file=products.json        → commits updated file (admin session required)
 *
 * Required Vercel env vars:
 *   GITHUB_TOKEN   — GitHub Personal Access Token (repo: contents write)
 *   ADMIN_PASSWORD / SESSION_SECRET — see api/_auth.js
 */
import { guard } from './_auth.js';

export const config = { runtime: 'edge' };

const OWNER  = 'ozgunustuay-sirius';
const REPO   = 'bysirius.com';
const BRANCH = 'main';

const ALLOWED = /^([\w\-]+\/)*([\w\-]+\.(html|json|txt|js|css|jpg|jpeg|png|gif|webp|svg|ico))$/;

export default async function handler(req) {
  const CORS = {}; // yalnızca aynı origin (admin paneli); CORS açılmaz
  const denied = await guard(req);
  if (denied) return denied;

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
