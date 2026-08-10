// Website/link review: pull page text + a rendered screenshot so the brain
// can review a site's content AND its visual design.
function extractUrl(text = '') {
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[)\].,]+$/, '') : null;
}

async function fetchText(url) {
  // Jina Reader renders JS-heavy pages (Wix/React/SPA) and returns clean text —
  // solves the 'empty shell' problem that plain HTML fetch hits on modern sites.
  try {
    const r = await fetch('https://r.jina.ai/' + url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; balabot/1.0)' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
    });
    if (r.ok) {
      let t = (await r.text()).trim();
      const title = ((t.match(/^Title:\s*(.+)$/m) || [])[1] || '').trim();
      if (t.length > 7000) t = t.slice(0, 7000);
      if (t && t.length > 60) return { title, text: t };
    }
  } catch (e) { console.error('jina reader failed:', e.message); }
  // fallback: plain fetch + strip tags
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; balabot/1.0)' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
    });
    const html = await res.text();
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    let body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (body.length > 6000) body = body.slice(0, 6000);
    return { title, text: body };
  } catch (e) { return { title: '', text: '' }; }
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

module.exports = { extractUrl, fetchText, shotB64 };
