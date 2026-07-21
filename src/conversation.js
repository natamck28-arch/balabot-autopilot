const store = require('./db');
const wa = require('./services/whatsapp');
const ig = require('./services/instagram');
const images = require('./services/images');
const ai = require('./services/ai');

const YES = /\b(yes|ok|approve|go|publish|כן|מאשר|אישור|לפרסם|פרסם|יאללה|אוקיי|אוקי|בטח)\b/i;
const STORY_RE = /סטורי|סטוריז|story|stories/i;
const FEED_RE = /\b(feed)\b|בפיד|לפיד|פוסט רגיל|רגיל/i;
const PUBLISH_RE = /תעלה|העלה|תפרסם|לפרסם|פרסם|שגר|תשגר/i;
function fmtLabel(f) { return f === 'story' ? 'סטורי' : 'פוסט בפיד'; }

async function handleInbound({ from, type, text, imageId }) {
  const client = store.getClientByWa(from);
  let convo = store.getConvo(from);
  convo.history = convo.history || [];

  if (!client) {
    await wa.sendText(from, "היי! 👋 המספר הזה עדיין לא מחובר לחשבון. סיים את קישור ההרשמה הקצר שקיבלת ואז כתוב לי שוב.");
    return;
  }
  const brand = client;

  // ---- image ----
  if (type === 'image' && imageId) {
    convo.history.push({ role: 'user', content: '[שלחתי תמונה]' + (text ? ' עם הערה: ' + text : '') });
    await wa.sendText(from, "קיבלתי 📸 רגע, מכין לך תצוגה מקדימה...");
    try {
      const { buffer } = await wa.downloadMedia(imageId);
      const publicUrl = await images.processForPost(buffer, brand);
      const caption = await ai.generateCaption(brand, text || '');
      const format = STORY_RE.test(text || '') ? 'story' : 'feed';
      convo.draft = { imageUrl: publicUrl, caption, format };
      convo.state = 'AWAITING_APPROVAL';
      convo.history.push({ role: 'assistant', content: 'שלחתי תצוגה מקדימה של הפוסט עם כיתוב.' });
      store.setConvo(from, convo);
      const previewCap = format === 'story'
        ? `הנה תצוגה מקדימה — יעלה כ*סטורי* 👇 (סטורי נעלם אחרי 24 שעות)\n\nענה *כן* כדי לפרסם, או כתוב מה לשנות.`
        : `הנה תצוגה מקדימה של הפוסט 👇\n\n${caption}\n\nענה *כן* כדי לפרסם, כתוב *סטורי* כדי להעלות כסטורי, או כתוב מה לשנות.`;
      await wa.sendImageByUrl(from, publicUrl, previewCap);
    } catch (e) { console.error(e); await wa.sendText(from, "הייתה בעיה עם התמונה — אפשר לשלוח אותה שוב?"); }
    return;
  }

  const t = (text || '').trim();
  convo.history.push({ role: 'user', content: t });

  // ---- approval flow ----
  if (convo.state === 'AWAITING_APPROVAL' && convo.draft) {
    convo.draft.format = convo.draft.format || 'feed';
    // let the user switch between feed post and story
    const switchStory = STORY_RE.test(t);
    const switchFeed = FEED_RE.test(t);
    if (switchStory) convo.draft.format = 'story';
    else if (switchFeed) convo.draft.format = 'feed';

    const publishIntent = YES.test(t) || PUBLISH_RE.test(t);

    // format switch WITHOUT a publish word -> re-confirm, don't post yet
    if ((switchStory || switchFeed) && !publishIntent) {
      store.setConvo(from, convo);
      const note = convo.draft.format === 'story'
        ? `סבבה — אעלה כ*סטורי* (נעלם אחרי 24 שעות). ענה *כן* לפרסום.`
        : `סבבה — אעלה כ*פוסט בפיד* עם הכיתוב. ענה *כן* לפרסום.`;
      await wa.sendImageByUrl(from, convo.draft.imageUrl, note);
      return;
    }

    if (publishIntent) {
      if (!client.igUserId || !client.pageToken) {
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        await wa.sendText(from, "🎉 מעולה! בהדגמה הזו עוד לא חובר חשבון אינסטגרם אמיתי — ברגע שנחבר, פוסטים כאלה יעלו אוטומטית באישורך. שלח לי עוד תמונה מתי שבא לך!");
        return;
      }
      const asStory = convo.draft.format === 'story';
      await wa.sendText(from, asStory ? "מעלה סטורי... 🚀" : "מפרסם עכשיו... 🚀");
      try {
        let mediaId;
        if (asStory) {
          ({ mediaId } = await ig.publishStory({ igUserId: client.igUserId, pageToken: client.pageToken, imageUrl: convo.draft.imageUrl }));
        } else {
          ({ mediaId } = await ig.publishPhoto({ igUserId: client.igUserId, pageToken: client.pageToken, imageUrl: convo.draft.imageUrl, caption: convo.draft.caption }));
        }
        store.logPost({ clientId: client.id, mediaId, caption: convo.draft.caption, format: convo.draft.format });
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        await wa.sendText(from, asStory
          ? `בוצע ✅ הסטורי עלה לאינסטגרם @${client.igUsername} (נעלם אחרי 24 שעות). שלח לי את הבא מתי שתרצה!`
          : `בוצע ✅ הפוסט עלה לאינסטגרם @${client.igUsername}. שלח לי את התמונה הבאה מתי שתרצה!`);
      } catch (e) { console.error('publish error', e.details || e.message); await wa.sendText(from, "לא הצלחתי לפרסם — סימנתי לצוות לבדוק. שום דבר לא פורסם."); }
      return;
    }
    // otherwise: let Claude decide -> revise the caption, OR exit the flow and just chat
    const decision = await ai.approvalDecision(brand, convo.draft.caption, t);
    if (decision && decision.action === 'revise' && decision.caption) {
      convo.draft.caption = decision.caption; store.setConvo(from, convo);
      await wa.sendImageByUrl(from, convo.draft.imageUrl, `עודכן 👇\n\n${decision.caption}\n\nענה *כן* כדי לפרסם, או כתוב מה לשנות.`);
      return;
    }
    // user wants to cancel / talk about something else -> leave approval mode
    convo.state = 'CHATTING'; convo.draft = null;
    convo.history.push({ role: 'assistant', content: (decision && decision.reply) || 'ביטלתי את הפוסט.' });
    store.setConvo(from, convo);
    await wa.sendText(from, (decision && decision.reply) || 'סבבה, ביטלתי את הפוסט. על מה בא לך לדבר? 😊');
    return;
  }

  // ---- general conversation, driven by Claude ----
  const reply = await ai.conversationReply(brand, convo.state || 'שיחה', convo.history, t);
  const finalReply = reply || `היי! אני העוזר של ${brand.businessName || 'העסק'} 😊 שלח לי תמונה ואני אכין ממנה פוסט מוכן לפרסום.`;
  convo.history.push({ role: 'assistant', content: finalReply });
  if (convo.history.length > 16) convo.history = convo.history.slice(-16);
  if (convo.state === 'NEW') convo.state = 'CHATTING';
  store.setConvo(from, convo);
  await wa.sendText(from, finalReply);
}

module.exports = { handleInbound };
