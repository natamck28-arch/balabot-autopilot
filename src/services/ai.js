// ============================================================
//  AI layer — caption generation + natural conversation replies.
//  Provider-agnostic. Set AI_PROVIDER=anthropic|openai in .env.
//  If provider is 'none', deterministic fallbacks are used so the
//  whole system still runs end-to-end for testing.
// ============================================================
const cfg = require('../config');

async function anthropic(system, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.ai.anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: cfg.ai.model, max_tokens: 600, system, messages }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.content?.[0]?.text?.trim() || '';
}

async function openai(system, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.ai.openaiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.ai.model,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 600,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices?.[0]?.message?.content?.trim() || '';
}

async function chat(system, messages) {
  try {
    if (cfg.ai.provider === 'anthropic' && cfg.ai.anthropicKey) return await anthropic(system, messages);
    if (cfg.ai.provider === 'openai' && cfg.ai.openaiKey) return await openai(system, messages);
  } catch (e) {
    console.error('AI error, using fallback:', e.message);
  }
  return null; // signal caller to use a fallback
}

// Generate an on-brand caption for a photo about to be posted.
async function generateCaption(brand, hint = '') {
  const system =
    `You write short, engaging Instagram captions for a business. ` +
    `Business: ${brand.businessName}. Style: ${brand.style || 'friendly, professional'}. ` +
    `Voice rules: ${brand.voiceRules || 'no clickbait, warm and human'}. ` +
    `Return ONLY the caption text plus 3-6 relevant hashtags on a new line. Language: ${brand.language || 'English'}.`;
  const out = await chat(system, [{ role: 'user', content: `Photo context from the owner: "${hint || 'no extra context'}". Write the caption.` }]);
  if (out) return out;
  // fallback
  const tags = (brand.hashtags || '#עסק #מקומי').trim();
  return `${brand.businessName || ''} ${hint ? '— ' + hint : ''}\n${tags}`.trim();
}

// Produce a natural WhatsApp reply given the conversation state + history.
async function conversationReply(brand, state, history, userText) {
  const system =
    `You are the friendly WhatsApp assistant for "${brand?.businessName || 'our studio'}", ` +
    `a done-for-you Instagram service. Keep replies SHORT (1-3 sentences), warm, in ${brand?.language || 'the user\'s language'}. ` +
    `Your job: collect photos from the business owner, confirm the caption, and get approval to post. ` +
    `Current step: ${state}. Never invent that something was posted unless told.`;
  const msgs = [...history.slice(-8), { role: 'user', content: userText }];
  const out = await chat(system, msgs);
  return out; // may be null -> caller uses scripted fallback
}

module.exports = { generateCaption, conversationReply };
