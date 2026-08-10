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

const RLM = '\u200F';
function formatForWhatsApp(text) {
  if (!text) return text;
  let s = String(text);
  s = s.replace(/^#{1,6}\s*/gm, '');          // drop markdown headers (##) — WhatsApp shows them literally
  s = s.replace(/\*\*(.+?)\*\*/g, '*$1*');  // **bold** -> *bold* (WhatsApp bold is single *)
  s = s.replace(/^\s*[-–]\s+/gm, '• ');       // dash bullets -> •
  // RTL: prepend a right-to-left mark to any line with Hebrew so mixed he/en/URLs don't jump
  s = s.split('\n').map(l => /[\u0590-\u05FF]/.test(l) ? RLM + l : l).join('\n');
  return s;
}

function splitForWhatsApp(text, limit) {
  limit = limit || 3500;
  if (!text) return [''];
  const lines = String(text).split('\n');
  const out = []; let cur = '';
  for (const line of lines) {
    if (cur && (cur.length + 1 + line.length) > limit) { out.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

const sendText = async (to, text) => {
  const parts = splitForWhatsApp(formatForWhatsApp(text));
  let last;
  for (const part of parts) last = await waPost({ to, type: 'text', text: { body: part, preview_url: false } });
  return last;
};

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
