require('dotenv').config();

const cfg = {
  port: process.env.PORT || 3000,
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  adminToken: process.env.ADMIN_TOKEN || 'dev-admin',

  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    graph: process.env.META_GRAPH_VERSION || 'v21.0',
  },
  ig: {
    scopes: (process.env.IG_OAUTH_SCOPES ||
      'instagram_basic,instagram_content_publish,pages_show_list,business_management').split(','),
  },
  wa: {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
    token: process.env.WA_ACCESS_TOKEN,
    verifyToken: process.env.WA_VERIFY_TOKEN || 'verify-me',
    businessNumber: process.env.WA_BUSINESS_NUMBER,
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'none',
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL || 'claude-sonnet-5',
  },
  images: {
    provider: process.env.IMAGE_PROVIDER || 'none',
    replicateToken: process.env.REPLICATE_API_TOKEN,
  },
  billing: {
    stripeKey: process.env.STRIPE_SECRET_KEY,
    priceId: process.env.STRIPE_PRICE_ID,
  },
};

cfg.graphUrl = `https://graph.facebook.com/${cfg.meta.graph}`;
module.exports = cfg;
