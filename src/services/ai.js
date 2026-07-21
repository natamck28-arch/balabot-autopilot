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
  return `אתה העוזר האישי של "${brand?.businessName || 'העסק'}" בוואטסאפ — שירות אמיתי שמנהל לבעל העסק את הרשתות החברתיות שלו.

חשוב מאוד להבין: אתה חלק ממערכת אוטומטית עם יכולות אמיתיות. אתה לא רק מודל שפה — יש לך "ידיים". המערכת שסביבך יודעת באמת לבצע:
1. שיפור תמונות ב-AI: כשהלקוח שולח תמונה, המערכת משפרת אותה אוטומטית לרמת צילום סטודיו מקצועי (תאורה, חדות, צבע), נאמנה למקור.
2. כתיבת כיתוב מותאם + hashtags.
3. פרסום לאינסטגרם אחרי אישור הלקוח.

לכן: **לעולם אל תגיד שאתה לא יכול לשפר תמונות או לערוך תמונות — אתה כן יכול, זו יכולת אמיתית של המערכת.** כשמדברים על שיפור תמונה, ענה בביטחון ("בטח! שלח לי תמונה ואני אשפר אותה לרמת סטודיו") והזמן את הלקוח לשלוח תמונה כדי שתעשה את זה בפועל.

כללים: תשובות קצרות (1-3 משפטים), טון חם וזורם, תמיד בעברית. אל תמציא שפרסמת משהו אם לא קרה בפועל. אם שואלים שאלה כללית — ענה בחום ובאופן מועיל.`;
}

async function conversationReply(brand, state, history, userText) {
  const msgs = [...(history || []).slice(-10)];
  if (userText && (!msgs.length || msgs[msgs.length - 1].content !== userText))
    msgs.push({ role: 'user', content: userText });
  return await chat(convoSystem(brand), msgs);
}


// During the approval step: decide if the user wants to revise the caption,
// or actually wants to cancel / talk about something else / ask a question.
async function approvalDecision(brand, currentCaption, userText) {
  const system =
    'לקוח של שירות ניהול רשתות חברתיות קיבל תצוגה מקדימה של פוסט עם הכיתוב:\n' +
    '"' + currentCaption + '"\n' +
    'עכשיו הוא כתב הודעה. החלט מה הכוונה שלו והחזר JSON תקין בלבד (בלי טקסט נוסף, בלי code fences):\n' +
    '- אם הוא מבקש לשנות/לתקן/לשפר את הכיתוב: {"action":"revise","caption":"הכיתוב החדש המתוקן בעברית כולל 3-6 hashtags"}\n' +
    '- אם הוא רוצה לבטל, לדבר על משהו אחר, לשאול שאלה, או משהו שלא קשור לכיתוב: {"action":"chat","reply":"תשובה טבעית וחמה בעברית"}';
  const out = await chat(system, [{ role: 'user', content: userText }]);
  if (!out) return null;
  try {
    const m = out.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : out);
  } catch (e) { return null; }
}

module.exports = { generateCaption, conversationReply, approvalDecision };
