import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concatScript, framesFor, layout, overlaps, place, srtTime, toSrt } from './lib.mjs';

test('srtTime formats hours, minutes, seconds and milliseconds', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(61.2345), '00:01:01,235');
  assert.equal(srtTime(3723.5), '01:02:03,500');
  assert.equal(srtTime(-1), '00:00:00,000');
});

test('toSrt numbers entries in time order', () => {
  const srt = toSrt([
    { start: 5, end: 6, text: 'hai' },
    { start: 1, end: 2.5, text: 'một' },
  ]);
  assert.equal(
    srt,
    '1\n00:00:01,000 --> 00:00:02,500\nmột\n\n2\n00:00:05,000 --> 00:00:06,000\nhai\n',
  );
});

test('layout puts segments end to end after the title card', () => {
  const placed = layout(
    [
      { phone: 'owner', start: 100, end: 110 },
      { phone: 'guest', start: 105, end: 108 },
    ],
    3,
  );
  assert.deepEqual(
    placed.map((s) => [s.at, s.duration]),
    [
      [3, 10],
      [13, 3],
    ],
  );
});

test('place maps an event into the segment of its phone, even when phones overlap in wall time', () => {
  const segments = layout(
    [
      { phone: 'guest', start: 100, end: 110 },
      { phone: 'kitchen', start: 104, end: 115 },
    ],
    0,
  );
  const { placed, dropped } = place(segments, [
    { phone: 'kitchen', t: 106, text: 'Bàn 1: hai phở bò' },
    { phone: 'guest', t: 101, text: 'gửi món' },
    { phone: 'kitchen', t: 99, text: 'off camera' },
  ]);
  assert.deepEqual(
    placed.map((e) => [e.text, e.at]),
    [
      ['Bàn 1: hai phở bò', 12],
      ['gửi món', 1],
    ],
  );
  assert.deepEqual(
    dropped.map((e) => e.text),
    ['off camera'],
  );
});

test('overlaps finds sounds that play over each other', () => {
  const a = { at: 0, duration: 2 };
  const b = { at: 1.5, duration: 1 };
  const c = { at: 3, duration: 1 };
  assert.deepEqual(overlaps([c, b, a]), [[a, b]]);
  assert.deepEqual(overlaps([a, c]), []);
});

test('framesFor starts with the frame on screen at the cut and clips the last one', () => {
  const frames = [
    { file: 'a.jpg', t: 1 },
    { file: 'b.jpg', t: 4 },
    { file: 'c.jpg', t: 6 },
    { file: 'd.jpg', t: 9 },
  ];
  assert.deepEqual(framesFor(frames, 2, 7), [
    { file: 'a.jpg', duration: 2 },
    { file: 'b.jpg', duration: 2 },
    { file: 'c.jpg', duration: 1 },
  ]);
  assert.deepEqual(framesFor(frames, 10, 12), [{ file: 'd.jpg', duration: 2 }]);
});

test('concatScript repeats the last file and quotes paths', () => {
  assert.equal(
    concatScript([
      { file: '/x/a.jpg', duration: 0.5 },
      { file: "/x/it's.jpg", duration: 1 },
    ]),
    "file '/x/a.jpg'\nduration 0.5000\nfile '/x/it'\\''s.jpg'\nduration 1.0000\nfile '/x/it'\\''s.jpg'\n",
  );
});
