const store = require('./db');
const wa = require('./services/whatsapp');
const ig = require('./services/instagram');
const images = require('./services/images');
const ai = require('./services/ai');

const YES = /\b(yes|ok|approve|go|publish|כן|מאשר|אישור|לפרסם|פרסם|יאללה|אוקיי|אוקי|בטח)\b/i;
const STORY_RE = /סטורי|סטוריז|story|stories/i;
const REEL_RE  = /\bרייל\b|\bריל\b|reel|reels/i;
const FEED_RE  = /\b(feed)\b|בפיד|לפיד|פוסט רגיל|רגיל/i;
const PUBLISH_RE = /תעלה|העלה|תפרסם|לפרסם|פרסם|שגר|תשגר/i;

// human labels for the current draft format
function fmtLabel(d) {
  if (d.format === 'story') return d.mediaKind === 'video' ? 'סטורי (וידאו)' : 'סטורי';
  if (d.format === 'reel') return 'רייל';
  return 'פוסט בפיד';
}
function doneLabel(d) {
  if (d.format === 'story') return 'הסטורי';
  if (d.format === 'reel') return 'הרייל';
  return 'הפוסט';
}
// re-send a preview: real image for photos, text-only for videos
async function sendPreview(from, draft, text) {
  if (draft.mediaKind === 'image' && draft.imageUrl) return wa.sendImageByUrl(from, draft.imageUrl, text);
  return wa.sendText(from, text);
}

async function handleInbound({ from, type, text, imageId, videoId }) {
  const client = store.getClientByWa(from);
  let convo = store.getConvo(from);
  convo.history = convo.history || [];

  if (!client) {
    await wa.sendText(from, "היי! 👋 המספר הזה עדיין לא מחובר לחשבון. סיים את קישור ההרשמה הקצר שקיבלת ואז כתוב לי שוב.");
    return;
  }
  const brand = client;

  // ---- inbound PHOTO ----
  if (type === 'image' && imageId) {
    convo.history.push({ role: 'user', content: '[שלחתי תמונה]' + (text ? ' עם הערה: ' + text : '') });
    await wa.sendText(from, "קיבלתי 📸 רגע, מכין לך תצוגה מקדימה...");
    try {
      const { buffer } = await wa.downloadMedia(imageId);
      const publicUrl = await images.processForPost(buffer, brand);
      const caption = await ai.generateCaption(brand, text || '');
      const format = STORY_RE.test(text || '') ? 'story' : 'feed';
      convo.draft = { mediaKind: 'image', imageUrl: publicUrl, caption, format };
      convo.state = 'AWAITING_APPROVAL';
      convo.history.push({ role: 'assistant', content: 'שלחתי תצוגה מקדימה של הפוסט.' });
      store.setConvo(from, convo);
      const previewCap = format === 'story'
        ? `הנה תצוגה מקדימה — יעלה כ*סטורי* 👇 (נעלם אחרי 24 שעות)\n\nענה *כן* כדי לפרסם, או כתוב מה לשנות.`
        : `הנה תצוגה מקדימה של הפוסט 👇\n\n${caption}\n\nענה *כן* כדי לפרסם, כתוב *סטורי* כדי להעלות כסטורי, או כתוב מה לשנות.`;
      await wa.sendImageByUrl(from, publicUrl, previewCap);
    } catch (e) { console.error(e); await wa.sendText(from, "הייתה בעיה עם התמונה — אפשר לשלוח אותה שוב?"); }
    return;
  }

  // ---- inbound VIDEO ----
  if (type === 'video' && videoId) {
    convo.history.push({ role: 'user', content: '[שלחתי סרטון]' + (text ? ' עם הערה: ' + text : '') });
    await wa.sendText(from, "קיבלתי 🎬 רגע, מכין לך תצוגה מקדימה...");
    try {
      const { buffer, mime } = await wa.downloadMedia(videoId);
      const publicUrl = images.hostVideo(buffer, mime);
      const caption = await ai.generateCaption(brand, text || '');
      const format = STORY_RE.test(text || '') ? 'story' : 'reel';
      convo.draft = { mediaKind: 'video', videoUrl: publicUrl, caption, format };
      convo.state = 'AWAITING_APPROVAL';
      convo.history.push({ role: 'assistant', content: 'שלחתי תצוגה מקדימה של הסרטון.' });
      store.setConvo(from, convo);
      const previewCap = format === 'story'
        ? `קיבלתי סרטון 🎬 — יעלה כ*סטורי* (נעלם אחרי 24 שעות).\n\nענה *כן* כדי לפרסם, או כתוב *רייל* כדי להעלות כרייל.`
        : `קיבלתי סרטון 🎬 — יעלה כ*רייל* עם הכיתוב:\n\n${caption}\n\nענה *כן* כדי לפרסם, כתוב *סטורי* להעלות כסטורי, או כתוב מה לשנות בכיתוב.`;
      await wa.sendText(from, previewCap);
    } catch (e) { console.error(e); await wa.sendText(from, "הייתה בעיה עם הסרטון — אפשר לשלוח אותו שוב?"); }
    return;
  }

  const t = (text || '').trim();
  convo.history.push({ role: 'user', content: t });

  // ---- approval flow ----
  if (convo.state === 'AWAITING_APPROVAL' && convo.draft) {
    const d = convo.draft;
    const isVideo = d.mediaKind === 'video';
    d.format = d.format || (isVideo ? 'reel' : 'feed');

    // allow switching the target format (only to ones valid for this media kind)
    const switchStory = STORY_RE.test(t);
    const switchReel  = isVideo && REEL_RE.test(t);
    const switchFeed  = !isVideo && FEED_RE.test(t);
    if (switchStory) d.format = 'story';
    else if (switchReel) d.format = 'reel';
    else if (switchFeed) d.format = 'feed';

    const publishIntent = YES.test(t) || PUBLISH_RE.test(t);

    // format switch WITHOUT a publish word -> re-confirm, don't post yet
    if ((switchStory || switchReel || switchFeed) && !publishIntent) {
      store.setConvo(from, convo);
      const note = d.format === 'story'
        ? `סבבה — אעלה כ*סטורי* (נעלם אחרי 24 שעות). ענה *כן* לפרסום.`
        : d.format === 'reel'
          ? `סבבה — אעלה כ*רייל* עם הכיתוב. ענה *כן* לפרסום.`
          : `סבבה — אעלה כ*פוסט בפיד* עם הכיתוב. ענה *כן* לפרסום.`;
      await sendPreview(from, d, note);
      return;
    }

    if (publishIntent) {
      if (!client.igUserId || !client.pageToken) {
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        await wa.sendText(from, "🎉 מעולה! בהדגמה הזו עוד לא חובר חשבון אינסטגרם אמיתי — ברגע שנחבר, פוסטים כאלה יעלו אוטומטית באישורך. שלח לי עוד תמונה מתי שבא לך!");
        return;
      }
      await wa.sendText(from, `מעלה ${fmtLabel(d)}... 🚀${isVideo ? ' (עיבוד וידאו יכול לקחת דקה)' : ''}`);
      try {
        const auth = { igUserId: client.igUserId, pageToken: client.pageToken };
        let mediaId;
        if (isVideo) {
          if (d.format === 'story') ({ mediaId } = await ig.publishVideoStory({ ...auth, videoUrl: d.videoUrl }));
          else ({ mediaId } = await ig.publishReel({ ...auth, videoUrl: d.videoUrl, caption: d.caption }));
        } else {
          if (d.format === 'story') ({ mediaId } = await ig.publishStory({ ...auth, imageUrl: d.imageUrl }));
          else ({ mediaId } = await ig.publishPhoto({ ...auth, imageUrl: d.imageUrl, caption: d.caption }));
        }
        store.logPost({ clientId: client.id, mediaId, caption: d.caption, format: d.format, mediaKind: d.mediaKind });
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        const suffix = d.format === 'story' ? ' (נעלם אחרי 24 שעות)' : '';
        await wa.sendText(from, `בוצע ✅ ${doneLabel(d)} עלה לאינסטגרם @${client.igUsername}${suffix}. שלח לי את הבא מתי שתרצה!`);
      } catch (e) { console.error('publish error', e.details || e.message); await wa.sendText(from, "לא הצלחתי לפרסם — סימנתי לצוות לבדוק. שום דבר לא פורסם."); }
      return;
    }

    // otherwise: let Claude decide -> revise the caption, OR exit the flow and just chat
    const decision = await ai.approvalDecision(brand, d.caption, t);
    if (decision && decision.action === 'revise' && decision.caption) {
      d.caption = decision.caption; store.setConvo(from, convo);
      await sendPreview(from, d, `עודכן 👇\n\n${decision.caption}\n\nענה *כן* כדי לפרסם, או כתוב מה לשנות.`);
      return;
    }
    // user wants to cancel / talk about something else -> leave approval mode
    convo.state = 'CHATTING'; convo.draft = null;
    convo.history.push({ role: 'assistant', content: (decision && decision.reply) || 'ביטלתי.' });
    store.setConvo(from, convo);
    await wa.sendText(from, (decision && decision.reply) || 'סבבה, ביטלתי. על מה בא לך לדבר? 😊');
    return;
  }

  // ---- general conversation, driven by Claude ----
  const reply = await ai.conversationReply(brand, convo.state || 'שיחה', convo.history, t);
  const finalReply = reply || `היי! אני העוזר של ${brand.businessName || 'העסק'} 😊 שלח לי תמונה או סרטון ואני אכין ממנו פוסט מוכן לפרסום.`;
  convo.history.push({ role: 'assistant', content: finalReply });
  if (convo.history.length > 16) convo.history = convo.history.slice(-16);
  if (convo.state === 'NEW') convo.state = 'CHATTING';
  store.setConvo(from, convo);
  await wa.sendText(from, finalReply);
}

module.exports = { handleInbound };
