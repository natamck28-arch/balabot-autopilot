// ============================================================
//  Image pipeline.
//  Input: Buffer (client's WhatsApp photo) -> Output: public https URL
//  that Instagram/WhatsApp can fetch.
//    enhance(buffer, brand)  -> professional version (OpenAI gpt-image edit)
//    hostPublicly(buffer)    -> public URL under /public
//  IMAGE_PROVIDER=openai turns on real enhancement. 'none' = pass-through.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');

const PUB_DIR = path.join(__dirname, '..', '..', 'public');
fs.mkdirSync(PUB_DIR, { recursive: true });

function enhancePrompt(brand) {
  const style = brand?.style ? ` בסגנון: ${brand.style}.` : '';
  return `Transform this into a professional, high-end social-media photograph for the business "${brand?.businessName || ''}".` +
    ` Dramatically improve lighting, sharpness, color and composition so it looks like it was shot by a professional photographer.` +
    ` Keep it realistic and TRUE to the original subject — do not invent or replace the product. Clean, appetizing, premium look.${style}`;
}

async function enhanceOpenAI(buffer, brand) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return buffer;
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', enhancePrompt(brand));
  form.append('size', '1024x1024');
  form.append('image', new Blob([buffer], { type: 'image/png' }), 'photo.png');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const j = await res.json();
  if (j.error) { console.error('OpenAI image error:', j.error.message); return buffer; }
  const b64 = j.data?.[0]?.b64_json;
  return b64 ? Buffer.from(b64, 'base64') : buffer;
}

async function enhance(buffer, brand) {
  try {
    if (cfg.images.provider === 'openai') return await enhanceOpenAI(buffer, brand);
  } catch (e) { console.error('enhance failed, using original:', e.message); }
  return buffer; // pass-through
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

module.exports = { enhance, hostPublicly, processForPost, PUB_DIR };
