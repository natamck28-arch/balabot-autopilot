// Website/link review: pull page text + a rendered screenshot so the brain
// can review a site's content AND its visual design.
function extractUrl(text = '') {
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[)\].,]+$/, '') : null;
}

async function fetchText(url) {
  const strip = (html) => {
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    let body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (body.length > 6000) body = body.slice(0, 6000);
    return { title, text: body };
  };
  // 1) plain fetch first — instant. If the page already carries real text, use it.
  let plain = { title: '', text: '' };
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; balabot/1.0)' }, signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    plain = strip(await res.text());
    if (plain.text.length > 600) return plain; // enough content -> fast path
  } catch (e) { /* fall through */ }
  // 2) thin/shell (SPA/Wix/React) -> Jina Reader renders the JS (slower)
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; balabot/1.0)' }, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    if (r.ok) {
      let t = (await r.text()).trim();
      const title = ((t.match(/^Title:\s*(.+)$/m) || [])[1] || '').trim() || plain.title;
      if (t.length > 7000) t = t.slice(0, 7000);
      if (t && t.length > 60) return { title, text: t };
    }
  } catch (e) { console.error('jina reader failed:', e.message); }
  return plain;
}

async function shotB64(url) {
  try {
    const shot = 'https://image.thum.io/get/width/1200/crop/1600/' + url;
    const res = await fetch(shot, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000) return null; // too small = render placeholder / failed
    const ct = res.headers.get('content-type') || 'image/jpeg';
    return { b64: buf.toString('base64'), mime: ct.includes('png') ? 'image/png' : 'image/jpeg' };
  } catch (e) { console.error('shot failed:', e.message); return null; }
}


function chunkText(text, size = 1500) {
  text = (text || '').trim();
  if (!text) return [];
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.slice(0, 8); // cap at 8 parts
}


function siteLinks(text, base) {
  let host; try { host = new URL(base).hostname; } catch { return []; }
  const urls = new Set();
  for (const m of String(text).matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) urls.add(m[1]);
  for (const m of String(text).matchAll(/\]\(([^)\s#]+)\)/g)) urls.add(m[1]);        // markdown [txt](target) — absolute OR relative (/projects)
  for (const m of String(text).matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) urls.add(m[0]);
  const junk = /(login|signin|sign-in|register|signup|sign-up|cart|checkout|account|wp-admin|wp-login|privacy|terms|policy|cookie|\/tag\/|\/category\/|feed|rss)/i;
  const seen = new Set(); const out = [];
  for (const h of urls) {
    let u; try { u = new URL(h, base); } catch { continue; }
    if (u.hostname !== host) continue;
    if (/\.(png|jpe?g|gif|svg|pdf|zip|mp4|css|js|ico|webp|woff2?)$/i.test(u.pathname)) continue;
    if (junk.test(u.pathname)) continue;
    const clean = (u.origin + u.pathname).replace(/\/$/, '');
    if (clean === u.origin) continue;
    if (seen.has(clean)) continue; seen.add(clean);
    out.push(clean);
  }
  const pri = /(about|אודות|service|שירות|product|מוצר|gallery|גלרי|portfolio|תיק|contact|צור|קשר|price|מחיר|menu|תפריט|shop|חנות)/i;
  out.sort((a, b) => (pri.test(b) ? 1 : 0) - (pri.test(a) ? 1 : 0));
  return out.slice(0, 5);
}

async function fetchLinks(url) {
  let links = [];
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; balabot/1.0)' }, signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    links = siteLinks(await res.text(), url);
  } catch (e) { /* ignore */ }
  if (links.length < 2) {
    try {
      const r = await fetch('https://r.jina.ai/' + url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; balabot/1.0)' }, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
      if (r.ok) links = Array.from(new Set([...links, ...siteLinks(await r.text(), url)])).slice(0, 5);
    } catch (e) { /* ignore */ }
  }
  return links;
}


// Render a URL to a screenshot via ScreenshotOne (needs SCREENSHOT_KEY env). Returns {b64,mime} or null.
async function shotFromUrl(url) {
  const key = process.env.SCREENSHOT_KEY;
  if (!key) return null;
  const api = 'https://api.screenshotone.com/take?access_key=' + encodeURIComponent(key)
    + '&url=' + encodeURIComponent(url)
    + '&format=jpg&viewport_width=1280&full_page=true&block_ads=true&block_cookie_banners=true&cache=true&image_quality=80';
  try {
    const r = await fetch(api, { signal: AbortSignal.timeout ? AbortSignal.timeout(22000) : undefined });
    if (!r.ok) { console.error('screenshot api status', r.status); return null; }
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 3000) return null;
    return { b64: buf.toString('base64'), mime: ct.includes('png') ? 'image/png' : 'image/jpeg' };
  } catch (e) { console.error('screenshot failed', e.message); return null; }
}

module.exports = { extractUrl, fetchText, shotB64, chunkText, fetchLinks, shotFromUrl };
