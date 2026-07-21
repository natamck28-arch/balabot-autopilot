// ============================================================
//  Image enhancement pipeline.
//  Input: a Buffer (from WhatsApp) -> Output: a PUBLIC https URL
//  (Instagram's API requires a public image_url, not a raw upload).
//
//  Two responsibilities:
//    1) enhance(buffer)  -> improved image buffer
//    2) hostPublicly(buffer) -> public URL Instagram can fetch
//
//  For the MVP we host the raw/enhanced file from THIS server under
//  /public/<id>.jpg. Plug a real enhancer (Replicate, your own model,
//  or the Adobe pipeline) into `enhance()` when ready.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');

const PUB_DIR = path.join(__dirname, '..', '..', 'public');
fs.mkdirSync(PUB_DIR, { recursive: true });

async function enhance(buffer /*, brand */) {
  if (cfg.images.provider === 'none') return buffer; // pass-through for MVP
  // TODO: call your enhancement provider here and return the improved buffer.
  // Example integration points:
  //   - Replicate model (upscsale/restore/relight)
  //   - Your in-house image model
  //   - Adobe pipeline
  return buffer;
}

function hostPublicly(buffer, ext = 'jpg') {
  const id = crypto.randomBytes(8).toString('hex');
  const file = path.join(PUB_DIR, `${id}.${ext}`);
  fs.writeFileSync(file, buffer);
  return `${cfg.publicUrl}/public/${id}.${ext}`;
}

async function processForPost(buffer, brand) {
  const improved = await enhance(buffer, brand);
  return hostPublicly(improved);
}

module.exports = { enhance, hostPublicly, processForPost, PUB_DIR };
