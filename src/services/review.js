// Website/link review: pull page text + a rendered screenshot so the brain
// can review a site's content AND its visual design.
function extractUrl(text = '') {
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[)\].,]+$/, '') : null;
}

async function fetchText(url) {
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
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
  if (body.length > 6000) body = body.slice(0, 6000);
  return { title, text: body };
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
