// ============================================================
//  WhatsApp Cloud API — send/receive helpers (Graph API v21.0)
//  Send messages, images, and download inbound media.
//  NOTE ON THE 24-HOUR WINDOW:
//    - Inside 24h of a user's last message you may send free-form text.
//    - To re-open a conversation later you must send a pre-approved
//      TEMPLATE message (see sendTemplate). This is a Meta rule.
// ============================================================
const cfg = require('../config');
const G = cfg.graphUrl;

async function waPost(body) {
  const res = await fetch(`${G}/${cfg.wa.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.wa.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    console.error('WA send error:', JSON.stringify(json.error || json));
    throw new Error(json.error?.message || `WA error ${res.status}`);
  }
  return json;
}

const sendText = (to, text) =>
  waPost({ to, type: 'text', text: { body: text, preview_url: false } });

const sendImageByUrl = (to, link, caption) =>
  waPost({ to, type: 'image', image: { link, caption } });

const sendImageById = (to, mediaId, caption) =>
  waPost({ to, type: 'image', image: { id: mediaId, caption } });

// Re-open a conversation after 24h with an approved template
const sendTemplate = (to, name, languageCode = 'en', components = []) =>
  waPost({ to, type: 'template', template: { name, language: { code: languageCode }, components } });

async function markRead(messageId) {
  try {
    await waPost({ status: 'read', message_id: messageId });
  } catch (_) { /* non-fatal */ }
}

// Download inbound media (client-sent photo). Returns a Buffer + mime.
async function downloadMedia(mediaId) {
  const meta = await fetch(`${G}/${mediaId}`, {
    headers: { Authorization: `Bearer ${cfg.wa.token}` },
  }).then(r => r.json());
  if (!meta.url) throw new Error('Could not resolve media url');
  const bin = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${cfg.wa.token}` },
  });
  const buf = Buffer.from(await bin.arrayBuffer());
  return { buffer: buf, mime: meta.mime_type, sha256: meta.sha256 };
}

module.exports = {
  sendText, sendImageByUrl, sendImageById, sendTemplate, markRead, downloadMedia,
};
