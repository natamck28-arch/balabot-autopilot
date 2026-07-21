// ============================================================
//  Image pipeline: Buffer (client's WhatsApp photo) -> public https URL.
//  enhance() uses OpenAI gpt-image (image-to-image) and PRESERVES the
//  original aspect ratio + dimensions. IMAGE_PROVIDER=none = pass-through.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
let sharp = null;
try { sharp = require('sharp'); } catch (_) { console.warn('sharp not available'); }

const PUB_DIR = path.join(__dirname, '..', '..', 'public');
fs.mkdirSync(PUB_DIR, { recursive: true });

function enhancePrompt(brand) {
  return `Re-render THIS EXACT photo as if it were captured by a professional photographer using a high-end camera.` +
    ` Keep the subject, product, layout, shapes, colors, textures, labels and every detail EXACTLY as in the original — do NOT change, add, remove, move or reimagine anything, and KEEP the same framing and aspect ratio.` +
    ` Only improve the photographic quality: natural realistic studio-grade lighting, crisp sharp focus, pleasing depth of field, accurate true-to-life colors, and clean professional composition.` +
    ` The result MUST look like a REAL, fully photorealistic photograph — authentic and believable, NOT AI-generated, NOT stylized, NOT illustrated, NOT cartoonish. Maximum realism and fidelity to the original.`;
}

// pick the closest gpt-image output size to the original orientation
function pickSize(w, h) {
  if (!w || !h) return '1024x1024';
  if (h > w * 1.1) return '1024x1536'; // portrait (e.g. 9:16 -> nearest tall)
  if (w > h * 1.1) return '1536x1024'; // landscape
  return '1024x1024';                  // square
}

async function enhanceOpenAI(buffer, brand) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return buffer;

  // read original dimensions + normalize to PNG for the API
  let width = null, height = null, pngBuf = buffer;
  if (sharp) {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width; height = meta.height;
      pngBuf = await sharp(buffer).png().toBuffer();
    } catch (e) { console.error('sharp meta failed:', e.message); }
  }

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', enhancePrompt(brand));
  form.append('size', pickSize(width, height));
  form.append('quality', 'high');
  form.append('input_fidelity', 'high');
  form.append('image', new Blob([pngBuf], { type: 'image/png' }), 'photo.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  const j = await res.json();
  if (j.error) { console.error('OpenAI image error:', j.error.message); return buffer; }
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) return buffer;
  let out = Buffer.from(b64, 'base64');

  // resize the result back to the EXACT original dimensions (preserve ratio)
  if (sharp && width && height) {
    try { out = await sharp(out).resize(width, height, { fit: 'cover' }).png().toBuffer(); }
    catch (e) { console.error('resize-back failed:', e.message); }
  }
  return out;
}

async function enhance(buffer, brand) {
  try { if (cfg.images.provider === 'openai') return await enhanceOpenAI(buffer, brand); }
  catch (e) { console.error('enhance failed, using original:', e.message); }
  return buffer;
}

function hostPublicly(buffer, ext = 'png') {
  const id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(PUB_DIR, `${id}.${ext}`), buffer);
  return `${cfg.publicUrl}/public/${id}.${ext}`;
}

async function processForPost(buffer, brand) {
  const improved = await enhance(buffer, brand);
  return hostPublicly(improved);
}

// Enhance an already-hosted image (by URL on our own server) on demand.
async function enhanceFromUrl(url, brand) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const improved = await enhance(buf, brand);
  return hostPublicly(improved);
}

// Videos are not enhanced — just hosted publicly so Instagram can fetch them.
function extFromMime(mime) {
  if (!mime) return 'mp4';
  if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
  return 'mp4';
}
function hostVideo(buffer, mime) {
  return hostPublicly(buffer, extFromMime(mime));
}

module.exports = { enhance, enhanceFromUrl, hostPublicly, hostVideo, extFromMime, processForPost, PUB_DIR };
