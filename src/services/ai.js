// AI layer — caption generation + natural conversation via Claude.
const cfg = require('../config');

async function anthropic(system, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg.ai.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
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
    body: JSON.stringify({ model: cfg.ai.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: 600 }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices?.[0]?.message?.content?.trim() || '';
}
async function chat(system, messages) {
  try {
    if (cfg.ai.provider === 'anthropic' && cfg.ai.anthropicKey) return await anthropic(system, messages);
    if (cfg.ai.provider === 'openai' && cfg.ai.openaiKey) return await openai(system, messages);
  } catch (e) { console.error('AI error, using fallback:', e.message); }
  return null;
}

async function generateCaption(brand, hint = '') {
  const system =
    `אתה כותב כיתובים קצרים ומזמינים לאינסטגרם עבור "${brand.businessName}". ` +
    `סגנון: ${brand.style || 'חם, מקצועי, ישראלי'}. ` +
    `החזר רק את הכיתוב + 3-6 hashtags רלוונטיים בשורה נפרדת. בעברית.`;
  const out = await chat(system, [{ role: 'user', content: `הקשר מבעל העסק: "${hint || 'אין'}". כתוב את הכיתוב.` }]);
  if (out) return out;
  const tags = (brand.hashtags || '#עסק #מקומי').trim();
  return `${brand.businessName || ''} ${hint ? '— ' + hint : ''}\n${tags}`.trim();
}

function convoSystem(brand) {
  return `אתה העוזר האישי של "${brand?.businessName || 'העסק'}" בוואטסאפ — שירות שמנהל לבעל העסק את הרשתות החברתיות שלו.
תפקידך: לנהל שיחה חמה, אנושית וטבעית בעברית, לעזור לו לפרסם תוכן, ולענות על כל שאלה.
היכולות שלך (מה שאתה באמת יכול לעשות): לקבל תמונות שהוא שולח, לשפר אותן, לכתוב כיתוב, ולפרסם אותן לאינסטגרם אחרי אישור שלו.
כללים: תשובות קצרות (1-3 משפטים), טון ידידותי וזורם, תמיד בעברית. אל תמציא שפרסמת משהו אם לא קרה. אם הוא רוצה לפרסם — הזמן אותו לשלוח תמונה. אם הוא שואל שאלה כללית — ענה בחום ובאופן מועיל.`;
}

async function conversationReply(brand, state, history, userText) {
  const msgs = [...(history || []).slice(-10)];
  if (userText && (!msgs.length || msgs[msgs.length - 1].content !== userText))
    msgs.push({ role: 'user', content: userText });
  return await chat(convoSystem(brand), msgs);
}

module.exports = { generateCaption, conversationReply };
