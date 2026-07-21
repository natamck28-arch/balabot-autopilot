// Client self-serve onboarding: Facebook Login -> discover IG -> save token + brand form
const express = require('express');
const path = require('path');
const cfg = require('../config');
const ig = require('../services/instagram');
const store = require('../db');

const router = express.Router();
const REDIRECT = `${cfg.publicUrl}/onboarding/callback`;

// Landing page (the link your sales rep sends the client)
router.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'onboarding.html')));

// Step 1: kick off Facebook Login
router.get('/connect', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  const url =
    `https://www.facebook.com/${cfg.meta.graph}/dialog/oauth` +
    `?client_id=${cfg.ig.appId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(cfg.ig.scopes.join(','))}`;
  res.redirect(url);
});

// Step 2: OAuth callback -> exchange token, find IG account, stash a pending client
router.get('/callback', async (req, res) => {
  const { code, error_description } = req.query;
  if (!code) return res.status(400).send(`Login failed: ${error_description || 'no code'}`);
  try {
    const userToken = await ig.exchangeCodeForToken(code, REDIRECT);
    const igInfo = await ig.discoverInstagram(userToken);
    const client = store.upsertClient({
      id: igInfo.igUserId,
      igUserId: igInfo.igUserId,
      igUsername: igInfo.igUsername,
      igAvatar: igInfo.igAvatar,
      pageId: igInfo.pageId,
      pageToken: igInfo.pageToken,
      status: 'connected_pending_brand',
    });
    // Send them to the brand form
    res.redirect(`/onboarding/brand?id=${client.id}`);
  } catch (e) {
    console.error(e.details || e.message);
    res.status(400).send(
      `<h2>Couldn't connect Instagram</h2><p>${e.message}</p>` +
      `<p>Most common fix: make sure the Instagram account is a <b>Business/Creator</b> account linked to a Facebook Page, then <a href="/onboarding/connect">try again</a>.</p>`);
  }
});

// Step 3: brand form
router.get('/brand', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'brand.html')));

router.post('/brand', express.urlencoded({ extended: true }), (req, res) => {
  const { id, businessName, waNumber, style, voiceRules, hashtags, language, frequency } = req.body;
  const client = store.getClient(id);
  if (!client) return res.status(404).send('Unknown client');
  store.upsertClient({
    id,
    businessName, style, voiceRules, hashtags, language, frequency,
    waNumber: (waNumber || '').replace(/[^0-9]/g, ''),
    status: 'active',
  });
  res.send(
    `<div style="font-family:system-ui;max-width:520px;margin:60px auto;text-align:center">
      <h1>You're all set ✅</h1>
      <p><b>${businessName}</b> is connected to Instagram <b>@${client.igUsername}</b>.</p>
      <p>Now open WhatsApp and send <b>“hi”</b> to <b>${cfg.wa.businessNumber || 'our business number'}</b> to send your first photo.</p>
     </div>`);
});

module.exports = router;
