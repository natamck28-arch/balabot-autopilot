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
  const biz = brand.businessType ? `תחום העסק: ${brand.businessType}. ` : '';
  const loc = brand.location ? `מיקום: ${brand.location}. ` : '';
  const system =
    `אתה מומחה SEO ושיווק דיגיטלי שכותב כיתובים לאינסטגרם עבור "${brand.businessName}". ${biz}${loc}` +
    `כל כיתוב חייב להיות ממוטב ל-SEO וגילוי, אבל להישאר טבעי וזורם (לא דחוס במילות מפתח):\n` +
    `1. שלב באופן טבעי מילות מפתח שהקהל של התחום הזה מחפש.\n` +
    `2. אם רלוונטי — מונחים גיאוגרפיים/מקומיים (עיר/שכונה) לחיזוק חיפוש מקומי.\n` +
    `3. השתמש במונחי התחום הספציפי (למשל לקצביה: נתחים, טרי, כשר; לנעליים: מותגים, מידות, סגנון; לנדל"ן: אזור, סוג נכס).\n` +
    `4. קריאה לפעולה קצרה.\n` +
    `5. בחר 5-10 hashtags אסטרטגיים — שילוב של רחבים, נישתיים, ומקומיים — שמגדילים חשיפה.\n` +
    `סגנון: ${brand.style || 'חם, מקצועי, ישראלי'}. החזר רק את הכיתוב + שורת ה-hashtags. בעברית.`;
  const out = await chat(system, [{ role: 'user', content: `הקשר מבעל העסק: "${hint || 'אין'}". כתוב כיתוב ממוטב SEO.` }]);
  if (out) return out;
  const tags = (brand.hashtags || '#עסק #מקומי').trim();
  return `${brand.businessName || ''} ${hint ? '— ' + hint : ''}\n${tags}`.trim();
}

function convoSystem(brand) {
  const connected = !!(brand && brand.igUserId && brand.igUsername);
  const hasFb = !!(brand && brand.pageId);
  const connectionNote = connected
    ? `מצב החיבור (עובדה מוחלטת — זה **כל** מה שאתה יודע על החיבור, ואל תסתור אותו):
- מחובר לאינסטגרם **@${brand.igUsername}**${hasFb ? ' ולדף הפייסבוק המקושר של העסק' : ''}.
- אתה יכול לפרסם: פוסט תמונה בפיד → אינסטגרם${hasFb ? ' וגם דף הפייסבוק' : ''}; סטורי ורייל → אינסטגרם.
חוקי עיגון (קריטי, מעל הכל): המידע למעלה הוא ה**מקור היחיד** למה שמחובר.
- **אסור לך להמציא או לנחש שום פרט חיבור** — שם דף, מזהה, "חנות/shop", כתובת, מספר, וכו'. אם הלקוח שואל פרט ספציפי שלא כתוב כאן במפורש — אל תמציא ואל תנחש; תגיד בפשטות "רגע, אני בודק לך את זה" ותציין שתחזור אליו, ואל תמשיך להמציא תשובות.
- **לעולם אל תגיד שאתה "לא מחובר"**, שאין חשבון, או ששכחת/טעית לגבי החיבור — אתה **כן** מחובר (ראה למעלה). אל תבקש שם משתמש ואל תציע לחבר.
- אם קודם אמרת משהו לא נכון והלקוח מתקן אותך — אל תמשיך להתפתל; פשוט אשר את העובדה הנכונה מלמעלה והתקדם.`
    : `מצב החיבור: החשבון עדיין לא חובר לאינסטגרם. אם הלקוח רוצה לחבר — הנחה אותו לסיים את קישור ההרשמה הקצר שקיבל מאיש המכירות. אתה עצמך לא מחבר חשבונות דרך הצ'אט ולא שולח קישורים. אל תמציא פרטי חיבור שאין לך.`;
  return `אתה העוזר האישי של "${brand?.businessName || 'העסק'}" בוואטסאפ — שירות אמיתי שמנהל לבעל העסק את הרשתות החברתיות שלו.

${connectionNote}

חשוב מאוד להבין: אתה חלק ממערכת אוטומטית עם יכולות אמיתיות. אתה לא רק מודל שפה — יש לך "ידיים". המערכת שסביבך יודעת באמת לבצע:
1. שיפור תמונות ב-AI: כשהלקוח שולח תמונה, המערכת משפרת אותה אוטומטית לרמת צילום סטודיו. אבל אם הלקוח רוצה את התמונה **בדיוק כמו שהיא, בלי שינוי/יצירה מחדש** — הוא יכול לכתוב 'מקורי' או 'כמו שהיא', והמערכת תעלה את התמונה המקורית עצמה בלי לגעת בה.
2. כתיבת כיתוב מותאם + hashtags.
3. פרסום לאינסטגרם אחרי אישור הלקוח.
4. גם סרטונים: אם הלקוח שולח וידאו, המערכת יודעת להעלות אותו כ*רייל* (ברירת מחדל) או כ*סטורי* — לפי מה שהלקוח מבקש.

לכן: **לעולם אל תגיד שאתה לא יכול לשפר תמונות או לערוך תמונות — אתה כן יכול, זו יכולת אמיתית של המערכת.** כשמדברים על שיפור תמונה, ענה בביטחון ("בטח! שלח לי תמונה ואני אשפר אותה לרמת סטודיו") והזמן את הלקוח לשלוח תמונה כדי שתעשה את זה בפועל.

מומחיות SEO (חשוב מאוד): אתה גם מומחה SEO ושיווק דיגיטלי. בכל תוכן שאתה יוצר (כיתובים, רעיונות, טקסטים) קח תמיד SEO בחשבון בשקט — מילות מפתח שהקהל מחפש, מונחים מקומיים, ומונחי התחום הספציפי של העסק. אתה מתאים את עצמך אוטומטית לתחום (קצביה, חנות נעליים, נדל"ן, מסעדה, וכו'). אל תחפור על SEO מיוזמתך — פשוט תיישם אותו. רק אם הלקוח שואל על SEO/קידום — הסבר בבהירות, בקצרה ובשפה שלו.

חוק ברזל (קריטי): אתה בעצמך **לא מפרסם כלום** מתוך שיחה רגילה. פרסום קורה **אך ורק** בתהליך המובנה: הלקוח שולח תמונה או סרטון, המערכת מכינה תצוגה מקדימה, והלקוח מאשר ("כן"). רק אז באמת עולה פוסט/רייל/סטורי. לכן:
- **לעולם אל תגיד שהעלית, פרסמת, או שכבר עלה** פוסט/רייל/סטורי — אלא אם זה קרה בפועל דרך התהליך הזה בהודעה הנוכחית.
- אם הלקוח מבקש להעלות משהו — אל תגיד "העליתי". תגיד: "שלח לי את התמונה/הסרטון ואכין לך תצוגה מקדימה, ואחרי שתאשר זה יעלה." אם רוצה סטורי — שיכתוב "סטורי"; אם רוצה רייל (וידאו) — זו ברירת המחדל לסרטון.
- אם הלקוח אומר שכבר העלית קודם — תקן בעדינות: לא העלית עדיין; זה יקרה אחרי ששולחים מדיה ומאשרים.

כללים: תשובות קצרות (1-3 משפטים), טון חם וזורם, תמיד בעברית. לעולם אל תמציא שפרסמת משהו אם לא קרה בפועל. אם שואלים שאלה כללית — ענה בחום ובאופן מועיל.`;
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
