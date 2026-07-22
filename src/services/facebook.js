// Publish to a Facebook Page via the Graph API, using the Page access token
// captured during onboarding (same token used for Instagram publishing).
const cfg = require('../config');
const G = cfg.graphUrl;

async function publishPagePhoto({ pageId, pageToken, imageUrl, caption }) {
  const res = await fetch(`${G}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, caption: caption || '', access_token: pageToken }),
  });
  const j = await res.json();
  if (!res.ok || j.error) {
    const e = new Error(j.error?.message || 'Facebook publish failed');
    e.details = j;
    throw e;
  }
  return { postId: j.post_id || j.id };
}

module.exports = { publishPagePhoto };
