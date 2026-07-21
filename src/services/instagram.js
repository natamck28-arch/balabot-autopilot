// ============================================================
//  Instagram publishing engine  (official Graph API v21.0)
//  Flow per Meta docs:
//    1) POST /{ig-user-id}/media           -> container id
//    2) GET  /{container-id}?fields=status_code  -> poll until FINISHED
//    3) POST /{ig-user-id}/media_publish   -> published media id
//  This is the ToS-safe way to post on behalf of many business accounts.
// ============================================================
const cfg = require('../config');
const G = cfg.graphUrl;

async function gql(pathAndQuery, { method = 'GET', body } = {}) {
  const url = `${G}/${pathAndQuery}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = new Error(json.error?.message || `Graph error ${res.status}`);
    e.details = json.error || json;
    throw e;
  }
  return json;
}

// --- OAuth: exchange the short code from Facebook Login for a long-lived token ---
async function exchangeCodeForToken(code, redirectUri) {
  const short = await gql(
    `oauth/access_token?client_id=${cfg.ig.appId}` +
    `&client_secret=${cfg.ig.appSecret}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${encodeURIComponent(code)}`
  );
  // upgrade to long-lived (~60 days; refreshable)
  const long = await gql(
    `oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${cfg.ig.appId}&client_secret=${cfg.ig.appSecret}` +
    `&fb_exchange_token=${short.access_token}`
  );
  return long.access_token;
}

// --- Find the IG Business account behind the user's Facebook Page ---
async function discoverInstagram(userToken) {
  const pages = await gql(`me/accounts?fields=name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${userToken}`);
  const withIg = (pages.data || []).find(p => p.instagram_business_account);
  if (!withIg) {
    throw new Error('No Instagram Business account is connected to this user\'s Facebook Page. Ask the client to convert IG to Business/Creator and link it to a Page.');
  }
  return {
    pageId: withIg.id,
    pageName: withIg.name,
    pageToken: withIg.access_token, // long-lived page token — use this to publish
    igUserId: withIg.instagram_business_account.id,
    igUsername: withIg.instagram_business_account.username,
    igAvatar: withIg.instagram_business_account.profile_picture_url,
  };
}

// --- Step 1: create a media container ---
async function createContainer({ igUserId, pageToken, imageUrl, caption, isReel = false, videoUrl, isStory = false }) {
  const body = { access_token: pageToken };
  if (isStory) { body.media_type = 'STORIES'; body.image_url = imageUrl; }
  else if (isReel) { body.media_type = 'REELS'; body.video_url = videoUrl; }
  else { body.image_url = imageUrl; }
  // Stories don't support captions via the API.
  if (caption && !isStory) body.caption = caption;
  const r = await gql(`${igUserId}/media`, { method: 'POST', body });
  return r.id; // container id
}

// --- Step 2: poll container status ---
async function waitForContainer(containerId, pageToken, { tries = 10, delayMs = 6000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const s = await gql(`${containerId}?fields=status_code&access_token=${pageToken}`);
    if (s.status_code === 'FINISHED') return true;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new Error(`Container status: ${s.status_code}`);
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('Container not FINISHED within timeout');
}

// --- Step 3: publish ---
async function publishContainer({ igUserId, pageToken, containerId }) {
  const r = await gql(`${igUserId}/media_publish`, {
    method: 'POST',
    body: { creation_id: containerId, access_token: pageToken },
  });
  return r.id; // published media id
}

// --- Convenience: full single-image publish ---
async function publishPhoto({ igUserId, pageToken, imageUrl, caption }) {
  const containerId = await createContainer({ igUserId, pageToken, imageUrl, caption });
  await waitForContainer(containerId, pageToken);
  const mediaId = await publishContainer({ igUserId, pageToken, containerId });
  return { mediaId, containerId };
}

// --- Convenience: publish a photo Story (disappears after 24h; no caption) ---
async function publishStory({ igUserId, pageToken, imageUrl }) {
  const containerId = await createContainer({ igUserId, pageToken, imageUrl, isStory: true });
  await waitForContainer(containerId, pageToken);
  const mediaId = await publishContainer({ igUserId, pageToken, containerId });
  return { mediaId, containerId };
}

module.exports = {
  exchangeCodeForToken,
  discoverInstagram,
  createContainer,
  waitForContainer,
  publishContainer,
  publishPhoto,
  publishStory,
};
