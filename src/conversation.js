// Conversation brain (Hebrew scripted flow, works without an AI key).
const store = require('./db');
const wa = require('./services/whatsapp');
const ig = require('./services/instagram');
const images = require('./services/images');
const ai = require('./services/ai');

const YES = /\b(yes|ok|approve|go|publish|כן|מאשר|אישור|לפרסם|פרסם|יאללה|אוקיי|אוקי)\b/i;

async function say(to, text) { await wa.sendText(to, text); }

async function handleInbound({ from, type, text, imageId }) {
  const client = store.getClientByWa(from);
  let convo = store.getConvo(from);
  convo.history = convo.history || [];
  if (text) convo.history.push({ role: 'user', content: text });

  if (!client) {
    await say(from, "היי! 👋 המספר הזה עדיין לא מחובר לחשבון. סיים את קישור ההרשמה הקצר שקיבלת ואז כתוב לי שוב.");
    return;
  }
  const brand = client;

  // ---- IMAGE received ----
  if (type === 'image' && imageId) {
    await say(from, "קיבלתי 📸 משפר את התמונה וכותב כיתוב, שנייה...");
    try {
      const { buffer } = await wa.downloadMedia(imageId);
      const publicUrl = await images.processForPost(buffer, brand);
      const caption = await ai.generateCaption(brand, text || '');
      convo.draft = { imageUrl: publicUrl, caption };
      convo.state = 'AWAITING_APPROVAL';
      store.setConvo(from, convo);
      await wa.sendImageByUrl(from, publicUrl,
        `הנה תצוגה מקדימה של הפוסט 👇\n\n${caption}\n\nענה *כן* כדי לפרסם, או כתוב לי מה לשנות.`);
    } catch (e) {
      console.error(e);
      await say(from, "הייתה בעיה בעיבוד התמונה. אפשר לשלוח אותה שוב?");
    }
    return;
  }

  const t = (text || '').trim();

  // ---- approval ----
  if (convo.state === 'AWAITING_APPROVAL' && convo.draft) {
    if (YES.test(t)) {
      if (!client.igUserId || !client.pageToken) {
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        await say(from, "🎉 מעולה! בהדגמה הזו עוד לא חיברנו חשבון אינסטגרם אמיתי — ברגע שנחבר אותו, פוסטים כאלה יעלו אוטומטית באישור שלך. שלח לי עוד תמונה מתי שבא לך!");
        return;
      }
      await say(from, "מפרסם עכשיו... 🚀");
      try {
        const { mediaId } = await ig.publishPhoto({
          igUserId: client.igUserId, pageToken: client.pageToken,
          imageUrl: convo.draft.imageUrl, caption: convo.draft.caption,
        });
        store.logPost({ clientId: client.id, mediaId, caption: convo.draft.caption });
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        await say(from, `בוצע ✅ הפוסט עלה לאינסטגרם @${client.igUsername}. שלח לי את התמונה הבאה מתי שתרצה!`);
      } catch (e) {
        console.error('publish error', e.details || e.message);
        await say(from, "לא הצלחתי לפרסם — סימנתי לצוות לבדוק את החיבור לאינסטגרם. שום דבר לא פורסם.");
      }
      return;
    }
    if (t.length > 0) {
      const caption = await ai.generateCaption(brand, t);
      convo.draft.caption = caption; store.setConvo(from, convo);
      await wa.sendImageByUrl(from, convo.draft.imageUrl,
        `עודכן 👇\n\n${caption}\n\nענה *כן* כדי לפרסם, או כתוב מה לשנות.`);
      return;
    }
  }

  // ---- greeting / default ----
  if (convo.state === 'NEW') { convo.state = 'AWAITING_PHOTO'; store.setConvo(from, convo); }
  await say(from, `היי! אני העוזר של ${brand.businessName || 'העסק שלך'} 😊 שלח לי תמונה ואני אשפר אותה, אכתוב כיתוב, ואחרי אישור שלך אפרסם אותה. 📸`);
}

module.exports = { handleInbound };
