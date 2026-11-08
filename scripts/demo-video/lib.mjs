// Pure helpers of the demo video pipeline (timeline maths, subtitles, ffmpeg concat lists).
// Kept free of I/O so `node --test` covers them (make test-scripts).

/** Seconds → SRT time "HH:MM:SS,mmm". */
export const srtTime = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
};

/** Subtitle entries `{ start, end, text }` (seconds) → SRT, numbered in time order. */
export const toSrt = (entries) =>
  [...entries]
    .sort((a, b) => a.start - b.start)
    .map((e, i) => `${String(i + 1)}\n${srtTime(e.start)} --> ${srtTime(e.end)}\n${e.text}\n`)
    .join('\n');

/**
 * Lays the recorded segments end to end after `offset` seconds (the title card).
 * A segment is `{ phone, start, end }` in wall-clock seconds of that phone's recording;
 * segments of different phones may overlap in wall time (a cut back to "meanwhile").
 */
export const layout = (segments, offset) => {
  let at = offset;
  return segments.map((segment) => {
    const placed = { ...segment, at, duration: segment.end - segment.start };
    at += placed.duration;
    return placed;
  });
};

/**
 * Places events `{ phone, t, ... }` (wall-clock seconds) on the final video: an event shows when
 * a segment of its phone covering `t` plays. Events outside every such segment are returned in
 * `dropped` (spoken off camera).
 */
export const place = (placedSegments, events) => {
  const placed = [];
  const dropped = [];
  for (const event of events) {
    const segment = placedSegments.find(
      (s) => s.phone === event.phone && event.t >= s.start && event.t < s.end,
    );
    if (segment) placed.push({ ...event, at: segment.at + (event.t - segment.start) });
    else dropped.push(event);
  }
  return { placed, dropped };
};

/** Pairs `[a, b]` of placed sounds `{ at, duration }` that play over each other. */
export const overlaps = (sounds) => {
  const sorted = [...sounds].sort((a, b) => a.at - b.at);
  const found = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const before = sorted[i - 1];
    if (before.at + before.duration > sorted[i].at + 0.05) found.push([before, sorted[i]]);
  }
  return found;
};

/**
 * The still frames `{ file, t }` (screencast, sorted by `t`) that cover `[start, end]`, each with
 * how long it stays on screen. The frame showing at `start` is the last one at or before it.
 */
export const framesFor = (frames, start, end) => {
  let first = 0;
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].t <= start) first = i;
    else break;
  }
  const out = [];
  for (let i = first; i < frames.length && frames[i].t < end; i += 1) {
    const from = Math.max(frames[i].t, start);
    const to = Math.min(frames[i + 1]?.t ?? end, end);
    if (to > from) out.push({ file: frames[i].file, duration: to - from });
  }
  return out;
};

/** An ffmpeg concat-demuxer script for still frames with durations (last file repeated, per the docs). */
export const concatScript = (list) => {
  const quote = (file) => `'${file.replaceAll("'", "'\\''")}'`;
  const lines = list.flatMap((f) => [`file ${quote(f.file)}`, `duration ${f.duration.toFixed(4)}`]);
  const last = list.at(-1);
  if (last) lines.push(`file ${quote(last.file)}`);
  return `${lines.join('\n')}\n`;
};
