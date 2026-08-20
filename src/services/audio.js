// Mix analysis: render a spectrum graph + measure per-band energy + loudness.
const { execFile } = require('child_process');
const util = require('util');
const execFileP = util.promisify(execFile);
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
let ffmpeg = null;
try { ffmpeg = require('ffmpeg-static'); } catch (_) { console.warn('ffmpeg-static not available'); }

async function run(args) {
  try { const { stderr } = await execFileP(ffmpeg, args, { maxBuffer: 20 * 1024 * 1024 }); return stderr || ''; }
  catch (e) { return (e.stderr || '') + (e.stdout || ''); }
}
function parseMean(err) { const m = err.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/); return m ? parseFloat(m[1]) : null; }
async function bandDb(inFile, filter) {
  const err = await run(['-hide_banner', '-i', inFile, '-af', filter + ',volumedetect', '-f', 'null', '-']);
  return parseMean(err);
}
function lastNum(err, re) { const all = err.match(re); if (!all) return null; const m = all[all.length - 1].match(/(-?\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; }

async function analyzeMix(buffer) {
  if (!ffmpeg) throw new Error('ffmpeg not available');
  const dir = os.tmpdir();
  const id = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(dir, id + '.in');
  const pngFile = path.join(dir, id + '.png');
  fs.writeFileSync(inFile, buffer);
  try {
    await run(['-y', '-hide_banner', '-i', inFile, '-lavfi', 'showspectrumpic=s=1100x520:mode=combined:scale=log:legend=1:color=intensity', pngFile]);
    let pngBuf = null; try { pngBuf = fs.readFileSync(pngFile); } catch (_) {}
    const bands = {
      sub:     await bandDb(inFile, 'lowpass=f=60'),
      bass:    await bandDb(inFile, 'highpass=f=60,lowpass=f=250'),
      lowmid:  await bandDb(inFile, 'highpass=f=250,lowpass=f=800'),
      mid:     await bandDb(inFile, 'highpass=f=800,lowpass=f=2500'),
      highmid: await bandDb(inFile, 'highpass=f=2500,lowpass=f=6000'),
      high:    await bandDb(inFile, 'highpass=f=6000'),
    };
    const eb = await run(['-hide_banner', '-i', inFile, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
    const lufs = lastNum(eb, /I:\s*-?\d+(?:\.\d+)?\s*LUFS/g);
    const lra = lastNum(eb, /LRA:\s*-?\d+(?:\.\d+)?\s*LU/g);
    const truePeak = lastNum(eb, /Peak:\s*-?\d+(?:\.\d+)?\s*dBFS/g);
    return { pngBuf, bands, lufs, lra, truePeak };
  } finally {
    try { fs.unlinkSync(inFile); } catch (_) {}
    try { fs.unlinkSync(pngFile); } catch (_) {}
  }
}
module.exports = { analyzeMix };
