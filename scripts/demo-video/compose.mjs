// Turns the recorded timeline (record.mjs) into the vertical demo video, its cover and subtitles.
//
// Steps: render the phone frame, title card and end card to PNG with Playwright (this ffmpeg has
// no drawtext) → encode each recorded segment inside the phone frame (1080×1920, H.264, 30 fps)
// → join cards and segments → mix the narration and the kitchen's spoken sentences at their
// times → normalise the level → mux with AAC → cover.jpg (from the title card) and the .srt.
//
// Usage: node scripts/demo-video/compose.mjs   (env: DEMO_WORK, DEMO_OUT)
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { cards } from './narration.mjs';
import { concatScript, framesFor, layout, overlaps, place, toSrt } from './lib.mjs';

const run = promisify(execFile);
const webRequire = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = webRequire('@playwright/test');

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const WORK = process.env.DEMO_WORK ?? join(tmpdir(), 'tableqr-demo-video');
const OUT = resolve(ROOT, process.env.DEMO_OUT ?? 'docs/delivery/001-qr-table-ordering/video');
const NAME = 'tableqr-demo-dien-thoai';
const BUILD = join(WORK, 'build');
const FPS = 30;
const W = 1080;
const H = 1920;
/** Where the phone's screen sits in the frame (the recording is 780×1688, same aspect). */
const SCREEN = { x: 161, y: 244, w: 758, h: 1640, radius: 46, bezel: 14 };
const NARRATION_GAIN = 1.0;
/** The kitchen phone's voice, a little louder than the narrator and band-limited like a speaker. */
const KITCHEN_GAIN = 1.4;

const ffmpeg = (args) =>
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
const frameRound = (seconds) => Math.round(seconds * FPS) / FPS;
const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Arial Unicode MS', sans-serif";
const GREEN = '#0f6b43';
const DARK = '#0a3d27';

/** A small QR-like mark: three outlined squares and a filled one on a white tile. */
const logo = (size) => {
  const cell = Math.round(size * 0.26);
  const ring = `<div style="height:${String(cell)}px;border:${String(Math.round(size * 0.06))}px solid ${GREEN};border-radius:${String(Math.round(size * 0.05))}px;box-sizing:border-box"></div>`;
  const dot = `<div style="height:${String(cell)}px;background:${GREEN};border-radius:${String(Math.round(size * 0.05))}px"></div>`;
  return `<div style="width:${String(size)}px;height:${String(size)}px;flex:none;border-radius:${String(Math.round(size * 0.24))}px;background:#fff;display:grid;place-items:center">
  <div style="display:grid;grid-template-columns:repeat(2,${String(cell)}px);gap:${String(Math.round(size * 0.09))}px">${ring}${ring}${ring}${dot}</div></div>`;
};

/** The frame around the phone: background, title strip, role chip and bezel; the screen is a hole. */
const frameHtml = (
  label,
) => `<!doctype html><html><body style="margin:0;width:${String(W)}px;height:${String(H)}px;background:transparent;font-family:${FONT}">
<div style="position:absolute;inset:0 0 auto 0;height:${String(SCREEN.y - SCREEN.bezel - 10)}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:2">
  <div style="display:flex;align-items:center;gap:18px;color:#fff;font-size:42px;font-weight:800;letter-spacing:-0.5px">${logo(58)}${escapeHtml(cards.strip)}</div>
  <div style="background:#ffd60a;color:#1a1a1a;font-size:34px;font-weight:700;padding:6px 26px;border-radius:999px">Điện thoại: ${escapeHtml(label)}</div>
</div>
<div style="position:absolute;left:${String(SCREEN.x)}px;top:${String(SCREEN.y)}px;width:${String(SCREEN.w)}px;height:${String(SCREEN.h)}px;border-radius:${String(SCREEN.radius)}px;box-shadow:0 0 0 ${String(SCREEN.bezel)}px #111,0 0 0 ${String(SCREEN.bezel + 2)}px #3a3a3a,0 0 0 3000px ${DARK}"></div>
</body></html>`;

const cardShell = (inner) =>
  `<!doctype html><html><body style="margin:0;width:${String(W)}px;height:${String(H)}px;background:linear-gradient(170deg,${GREEN} 0%,${DARK} 100%);font-family:${FONT};color:#fff;display:flex;flex-direction:column;align-items:center;text-align:center">${inner}</body></html>`;

const phoneMock = (
  shot,
  width,
) => `<div style="width:${String(width)}px;height:${String(Math.round((width * 1688) / 780))}px;border-radius:${String(width * 0.08)}px;box-shadow:0 0 0 12px #111,0 30px 60px rgba(0,0,0,.45);overflow:hidden;background:#fff">
<img src="${shot}" style="width:100%;height:100%;display:block"></div>`;

const titleHtml = (shot) =>
  cardShell(`<div style="margin-top:150px">${logo(150)}</div>
<div style="font-size:150px;font-weight:900;letter-spacing:-3px;margin-top:30px">${escapeHtml(cards.title)}</div>
<div style="font-size:58px;font-weight:700;margin-top:6px">${escapeHtml(cards.titleLead)}</div>
<div style="font-size:36px;opacity:.85;margin-top:22px">${escapeHtml(cards.titleNote)}</div>
<div style="margin-top:70px">${phoneMock(shot, 440)}</div>`);

const endHtml = () =>
  cardShell(`<div style="margin-top:430px">${logo(190)}</div>
<div style="font-size:150px;font-weight:900;letter-spacing:-3px;margin-top:40px">${escapeHtml(cards.title)}</div>
${cards.endLines
  .map(
    (line, i) =>
      `<div style="font-size:${i === 0 ? '54' : '50'}px;font-weight:${i === 0 ? '700' : '600'};margin-top:${i === 0 ? '60' : '28'}px;max-width:900px;line-height:1.25">${escapeHtml(line)}</div>`,
  )
  .join('')}
<div style="margin-top:80px;background:#ffd60a;color:#1a1a1a;font-size:40px;font-weight:800;padding:16px 40px;border-radius:999px">Đăng ký quán ngay hôm nay</div>`);

const renderPngs = async (labels, shot) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const out = { frames: {} };
    for (const [i, label] of labels.entries()) {
      await page.setContent(frameHtml(label));
      out.frames[label] = join(BUILD, `frame-${String(i)}.png`);
      await page.screenshot({ path: out.frames[label], omitBackground: true });
    }
    await page.setContent(titleHtml(shot));
    await page.waitForLoadState('load');
    out.title = join(BUILD, 'title.png');
    await page.screenshot({ path: out.title });
    await page.setContent(endHtml());
    out.end = join(BUILD, 'end.png');
    await page.screenshot({ path: out.end });
    return out;
  } finally {
    await browser.close();
  }
};

const encodeCard = async (png, duration, file) => {
  const fadeOut = (duration - 0.4).toFixed(2);
  await ffmpeg([
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-i',
    png,
    '-t',
    duration.toFixed(3),
    '-vf',
    `format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut}:d=0.4`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-r',
    String(FPS),
    '-pix_fmt',
    'yuv420p',
    file,
  ]);
};

const encodeSegment = async (segment, frames, framePng, file, index) => {
  const list = framesFor(frames, segment.start, segment.end);
  if (list.length === 0)
    throw new Error(`no frames for segment ${String(index)} (${segment.label})`);
  const script = join(BUILD, `seg-${String(index)}.txt`);
  writeFileSync(script, concatScript(list));
  const { x, y, w, h } = SCREEN;
  await ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    script,
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-i',
    framePng,
    '-filter_complex',
    `[0:v]scale=${String(w)}:${String(h)}:flags=lanczos,setsar=1,fps=${String(FPS)},pad=${String(W)}:${String(H)}:${String(x)}:${String(y)}:black,format=yuv420p[s];` +
      `[1:v]format=rgba[f];[s][f]overlay=0:0:shortest=1,format=yuv420p[v]`,
    '-map',
    '[v]',
    '-t',
    segment.duration.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-r',
    String(FPS),
    '-pix_fmt',
    'yuv420p',
    file,
  ]);
};

/** Mixes every sound `{ file, at, kind }` into one stereo WAV of `total` seconds. */
const mix = async (sounds, total, file) => {
  const inputs = sounds.flatMap((s) => ['-i', s.file]);
  const chains = sounds.map((s, i) => {
    const ms = Math.round(s.at * 1000);
    const shape =
      s.kind === 'kitchen'
        ? `highpass=f=220,lowpass=f=6000,volume=${String(KITCHEN_GAIN)}`
        : `volume=${String(NARRATION_GAIN)}`;
    return `[${String(i)}:a]aresample=48000,aformat=channel_layouts=stereo,${shape},adelay=${String(ms)}|${String(ms)}[a${String(i)}]`;
  });
  const graph = `${chains.join(';')};${sounds.map((_, i) => `[a${String(i)}]`).join('')}amix=inputs=${String(sounds.length)}:normalize=0:dropout_transition=0,apad,atrim=0:${total.toFixed(3)}[m]`;
  await ffmpeg([...inputs, '-filter_complex', graph, '-map', '[m]', '-c:a', 'pcm_s16le', file]);
};

const volume = async (file) => {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const max = Number(/max_volume: (-?[\d.]+) dB/.exec(stderr)?.[1]);
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1]);
  return { max, mean };
};

const main = async () => {
  const tl = JSON.parse(readFileSync(join(WORK, 'timeline.json'), 'utf8'));
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const titleDuration = frameRound(Math.max(3, tl.intro.duration + 1.0));
  const segments = layout(
    tl.segments.map((s) => ({ ...s, end: s.start + frameRound(s.end - s.start) })),
    titleDuration,
  );
  const endAt = segments.at(-1).at + segments.at(-1).duration;
  const endDuration = frameRound(Math.max(4, tl.outro.duration + 1.4));
  const total = endAt + endDuration;

  // A screenshot of the guest's menu for the title card: the moment the guest opens the cart.
  const cartLine = tl.lines.find((l) => l.key === 'guest3');
  const guestFrames = tl.frames_guest;
  const shotFrame = framesFor(guestFrames, cartLine.t + 6, cartLine.t + 6.1)[0];
  const shot = `data:image/jpeg;base64,${readFileSync(shotFrame.file).toString('base64')}`;

  const labels = [...new Set(segments.map((s) => s.label))];
  console.log('Rendering the frame and the cards…');
  const pngs = await renderPngs(labels, shot);

  console.log(`Encoding ${String(segments.length)} segments…`);
  const parts = [join(BUILD, 'part-title.mp4')];
  await encodeCard(pngs.title, titleDuration, parts[0]);
  for (const [i, segment] of segments.entries()) {
    const file = join(BUILD, `part-${String(i)}.mp4`);
    await encodeSegment(
      segment,
      tl[`frames_${segment.phone}`],
      pngs.frames[segment.label],
      file,
      i,
    );
    parts.push(file);
  }
  const endPart = join(BUILD, 'part-end.mp4');
  await encodeCard(pngs.end, endDuration, endPart);
  parts.push(endPart);
  const partsList = join(BUILD, 'parts.txt');
  writeFileSync(partsList, parts.map((p) => `file '${p}'`).join('\n') + '\n');
  const silent = join(BUILD, 'video.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', partsList, '-c', 'copy', silent]);

  // Sounds on the final timeline.
  const lines = place(segments, tl.lines);
  const speech = place(segments, tl.speech);
  const intro = { ...tl.intro, at: 0.5, key: 'intro' };
  const outro = { ...tl.outro, at: endAt + 0.4, key: 'outro' };
  const narrationSounds = [intro, ...lines.placed, outro].map((l) => ({ ...l, kind: 'narration' }));
  const kitchenSounds = speech.placed.map((s) => ({ ...s, kind: 'kitchen' }));
  for (const dropped of [...lines.dropped, ...speech.dropped]) {
    console.log(`  off camera (not in the video): ${dropped.text ?? dropped.caption}`);
  }
  const clashes = overlaps([...narrationSounds, ...kitchenSounds]);
  for (const [a, b] of clashes) {
    console.warn(`  WARNING overlap: "${a.caption ?? a.text}" / "${b.caption ?? b.text}"`);
  }
  const mixed = join(BUILD, 'mix.wav');
  await mix([...narrationSounds, ...kitchenSounds], total, mixed);
  const level = await volume(mixed);
  const gain = (-1.5 - level.max).toFixed(1);

  const mp4 = join(OUT, `${NAME}.mp4`);
  await ffmpeg([
    '-i',
    silent,
    '-i',
    mixed,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-c:v',
    'copy',
    '-af',
    `volume=${gain}dB`,
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-t',
    total.toFixed(3),
    '-movflags',
    '+faststart',
    mp4,
  ]);
  await ffmpeg(['-ss', '1.6', '-i', mp4, '-frames:v', '1', '-q:v', '2', join(OUT, 'cover.jpg')]);

  const subtitles = [
    ...narrationSounds.map((l) => ({ start: l.at, end: l.at + l.duration, text: l.caption })),
    ...kitchenSounds.map((s) => ({
      start: s.at,
      end: s.at + s.duration,
      text: `[Máy ở bếp đọc] ${s.text}`,
    })),
  ];
  writeFileSync(join(OUT, `${NAME}.srt`), toSrt(subtitles));

  const scenes = [
    { at: 0, label: 'Mở đầu' },
    ...segments.map((s) => ({ at: s.at, label: s.label })),
    { at: endAt, label: 'Kết' },
  ];
  writeFileSync(
    join(BUILD, 'report.json'),
    JSON.stringify(
      {
        total,
        scenes,
        lines: narrationSounds.map((l) => ({ at: l.at, key: l.key })),
        speech: kitchenSounds.map((s) => ({ at: s.at, text: s.text })),
        level,
        gain,
        clashes: clashes.length,
      },
      null,
      1,
    ),
  );
  const mb = statSync(mp4).size / 1e6;
  console.log(
    `${mp4}: ${total.toFixed(1)} s, ${mb.toFixed(1)} MB (mix peak ${String(level.max)} dB → gain ${gain} dB)`,
  );
  for (const s of scenes)
    console.log(`  ${new Date(s.at * 1000).toISOString().slice(14, 19)}  ${s.label}`);
};

await main();
