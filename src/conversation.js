const store = require('./db');
const wa = require('./services/whatsapp');
const ig = require('./services/instagram');
const fb = require('./services/facebook');
const images = require('./services/images');
const ai = require('./services/ai');

const YES = /\b(yes|ok|approve|go|publish|כן|מאשר|אישור|לפרסם|פרסם|יאללה|אוקיי|אוקי|בטח|תעלה|העלה)\b/i;
const PUBLISH_RE = /תעלה|העלה|תפרסם|לפרסם|פרסם|שגר|תשגר/i;
const STORY_RE = /סטורי|סטוריז|story|stories/i;
const REEL_RE  = /\bרייל\b|\bריל\b|reel|reels/i;
const FEED_RE  = /\bfeed\b|בפיד|לפיד|פוסט רגיל|\bפוסט\b|רגיל/i;
// "as is" / original — do NOT recreate with AI
const RAW_RE = /כמו שהיא|כמו שזה|כמו שהוא|בלי שיפור|בלי לשפר|לא לשפר|אל תשפר|בלי לשנות|בלי שינוי|בלי לגעת|מקורי|מקורית|המקורי|as[ -]?is|original|raw/i;
const ENHANCE_RE = /תשפר|לשפר|שיפור|תשדרג|שדרג|enhance|improve/i;
// destination for a feed photo: Instagram only / Facebook only / both
const DEST_IG_RE = /רק אינסטגרם|רק אינסטה|בלי פייסבוק|לא פייסבוק|אינסטגרם בלבד/i;
const DEST_FB_RE = /רק פייסבוק|פייסבוק בלבד/i;
const DEST_BOTH_RE = /שניהם|גם פייסבוק|גם לפייסבוק|לשניהם/i;

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
async function sendPreview(from, draft, text) {
  if (draft.mediaKind === 'image' && draft.imageUrl) return wa.sendImageByUrl(from, draft.imageUrl, text);
  return wa.sendText(from, text);
}
// build the caption shown under a preview
function previewText(d) {
  const rawTag = d.mediaKind === 'image' && d.raw ? ' (התמונה המקורית, בלי שיפור AI)' : '';
  if (d.format === 'story') {
    const alt = d.mediaKind === 'image' ? (d.raw ? "'שפר' לשיפור AI" : "'מקורי' להעלות בלי שיפור") + " · 'פוסט' לפוסט בפיד" : "'רייל' להעלות כרייל";
    return `תצוגה מקדימה — יעלה כ*סטורי*${rawTag} 👇\n\nענה *כן* לפרסום · ${alt} · או כתוב מה לשנות.`;
  }
  if (d.format === 'reel') {
    return `תצוגה מקדימה — יעלה כ*רייל* 🎬\n\n${d.caption}\n\nענה *כן* לפרסום · 'סטורי' להעלות כסטורי · או מה לשנות בכיתוב.`;
  }
  const alt = d.mediaKind === 'image' ? (d.raw ? "'שפר' לשיפור AI" : "'מקורי' להעלות בלי שיפור") : '';
  const destLine = d.dest === 'ig' ? '\n📤 יעלה ל*אינסטגרם בלבד*.'
    : d.dest === 'fb' ? '\n📤 יעלה ל*פייסבוק בלבד*.'
    : d.dest === 'both' ? '\n📤 יעלה ל*אינסטגרם + פייסבוק* (כתוב "רק אינסטגרם" / "רק פייסבוק" לשנות).'
    : '';
  return `תצוגה מקדימה של הפוסט${rawTag} 👇\n\n${d.caption}${destLine}\n\nענה *כן* לפרסום · 'סטורי' לסטורי${alt ? ' · ' + alt : ''} · או מה לשנות.`;
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
      const { buffer, mime } = await wa.downloadMedia(imageId);
      const ext = images.extFromMime(mime) === 'mov' ? 'jpg' : (mime && mime.includes('png') ? 'png' : 'jpg');
      const originalUrl = images.hostPublicly(buffer, ext);   // always keep the untouched original
      const rawWanted = RAW_RE.test(text || '');
      let enhancedUrl = null, imageUrl = originalUrl, raw = true;
      if (!rawWanted) {
        try { enhancedUrl = await images.processForPost(buffer, brand); imageUrl = enhancedUrl; raw = false; }
        catch (e) { console.error('enhance failed, using original:', e.message); }
      }
      const caption = await ai.generateCaption(brand, text || '');
      const format = STORY_RE.test(text || '') ? 'story' : 'feed';
      const hasFb = !!(client.pageId && client.pageToken);
      const dest = (format === 'feed' && hasFb) ? 'both' : 'ig';
      convo.draft = { mediaKind: 'image', imageUrl, originalUrl, enhancedUrl, raw, caption, format, dest };
      convo.state = 'AWAITING_APPROVAL';
      convo.history.push({ role: 'assistant', content: 'שלחתי תצוגה מקדימה.' });
      store.setConvo(from, convo);
      await wa.sendImageByUrl(from, imageUrl, previewText(convo.draft));
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
      await wa.sendText(from, previewText(convo.draft));
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

    let changed = false;

    // image: raw <-> enhanced toggle
    if (!isVideo) {
      if (RAW_RE.test(t) && !d.raw) {
        d.raw = true; d.imageUrl = d.originalUrl; changed = true;
      } else if (ENHANCE_RE.test(t) && d.raw) {
        try {
          if (!d.enhancedUrl) { await wa.sendText(from, "משפר את התמונה... ✨"); d.enhancedUrl = await images.enhanceFromUrl(d.originalUrl, brand); }
          d.raw = false; d.imageUrl = d.enhancedUrl; changed = true;
        } catch (e) { console.error('on-demand enhance failed', e.message); await wa.sendText(from, "לא הצלחתי לשפר כרגע — נשאר עם המקורית."); }
      }
    }

    // image feed: destination toggle (Instagram / Facebook / both)
    if (!isVideo && d.format === 'feed' && client.pageId && client.pageToken) {
      if (DEST_IG_RE.test(t) && d.dest !== 'ig') { d.dest = 'ig'; changed = true; }
      else if (DEST_FB_RE.test(t) && d.dest !== 'fb') { d.dest = 'fb'; changed = true; }
      else if (DEST_BOTH_RE.test(t) && d.dest !== 'both') { d.dest = 'both'; changed = true; }
    }

    // format toggle
    const wantStory = STORY_RE.test(t);
    const wantReel = isVideo && REEL_RE.test(t);
    const wantFeed = !isVideo && FEED_RE.test(t);
    const formatKeyword = wantStory || wantReel || wantFeed;
    const newFormat = wantStory ? 'story' : wantReel ? 'reel' : wantFeed ? 'feed' : d.format;
    const formatChanged = newFormat !== d.format;
    d.format = newFormat;
    if (formatChanged) changed = true;

    // publish if: explicit yes/publish word, OR a format keyword that matches the
    // CURRENT format with no other pending change (i.e. "yes, this format").
    const explicitYes = YES.test(t) || PUBLISH_RE.test(t);
    const shouldPublish = explicitYes || (formatKeyword && !formatChanged && !changed);

    if (shouldPublish) {
      if (!client.igUserId || !client.pageToken) {
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        await wa.sendText(from, "🎉 מעולה! אבל עדיין אין כאן חשבון אינסטגרם מחובר. סיים את קישור ההרשמה ואז נוכל לפרסם.");
        return;
      }
      await wa.sendText(from, `מעלה ${fmtLabel(d)}... 🚀${isVideo ? ' (עיבוד וידאו יכול לקחת דקה)' : ''}`);
      try {
        const auth = { igUserId: client.igUserId, pageToken: client.pageToken };
        let mediaId;
        if (isVideo) {
          if (d.format === 'story') ({ mediaId } = await ig.publishVideoStory({ ...auth, videoUrl: d.videoUrl }));
          else ({ mediaId } = await ig.publishReel({ ...auth, videoUrl: d.videoUrl, caption: d.caption }));
        } else if (d.format === 'story') {
          ({ mediaId } = await ig.publishStory({ ...auth, imageUrl: d.imageUrl }));
        } else {
          // feed photo — honor the chosen destination (Instagram / Facebook / both)
          const dest = d.dest || 'ig';
          const parts = [];
          if (dest !== 'fb') {
            ({ mediaId } = await ig.publishPhoto({ ...auth, imageUrl: d.imageUrl, caption: d.caption }));
            parts.push(`אינסטגרם @${client.igUsername}`);
          }
          if (dest !== 'ig' && client.pageId && client.pageToken) {
            try { await fb.publishPagePhoto({ pageId: client.pageId, pageToken: client.pageToken, imageUrl: d.imageUrl, caption: d.caption }); parts.push('דף הפייסבוק'); }
            catch (e) { console.error('FB publish error', e.details || e.message); parts.push('(פייסבוק לא עלה — בודקים)'); }
          }
          store.logPost({ clientId: client.id, mediaId, caption: d.caption, format: d.format, mediaKind: d.mediaKind, raw: !!d.raw, dest });
          convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
          await wa.sendText(from, `בוצע ✅ הפוסט עלה ל${parts.join(' + ')}. שלח לי את הבא מתי שתרצה!`);
          return;
        }
        store.logPost({ clientId: client.id, mediaId, caption: d.caption, format: d.format, mediaKind: d.mediaKind, raw: !!d.raw });
        convo.state = 'IDLE'; convo.draft = null; store.setConvo(from, convo);
        const suffix = d.format === 'story' ? ' (נעלם אחרי 24 שעות)' : '';
        await wa.sendText(from, `בוצע ✅ ${doneLabel(d)} עלה לאינסטגרם @${client.igUsername}${suffix}. שלח לי את הבא מתי שתרצה!`);
      } catch (e) { console.error('publish error', e.details || e.message); await wa.sendText(from, "לא הצלחתי לפרסם — סימנתי לצוות לבדוק. שום דבר לא פורסם."); }
      return;
    }

    // a change was requested (format / raw / enhance) but no publish word -> show updated preview ONCE
    if (changed) {
      store.setConvo(from, convo);
      await sendPreview(from, d, previewText(d));
      return;
    }

    // otherwise: let Claude decide -> revise the caption, OR exit the flow and just chat
    const decision = await ai.approvalDecision(brand, d.caption, t);
    if (decision && decision.action === 'revise' && decision.caption) {
      d.caption = decision.caption; store.setConvo(from, convo);
      await sendPreview(from, d, `עודכן 👇\n\n${decision.caption}\n\nענה *כן* לפרסום, או כתוב מה לשנות.`);
      return;
    }
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
