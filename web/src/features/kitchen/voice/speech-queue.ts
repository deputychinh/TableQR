/**
 * One voice at a time (TQR-027): sentences wait their turn, so two announcements never overlap.
 * The engine is a port; the browser adapter is `browser-speech.ts`, tests pass a fake.
 */
export interface SpeechEngine {
  /** Starts saying `text`; calls `done` exactly once when it ended, failed or was cancelled. */
  speak: (text: string, done: () => void) => void;
  /** Stops what is being said now. */
  cancel: () => void;
}

export interface SpeechQueue {
  /** Says `text` now, or after the sentences already waiting. */
  say: (text: string) => void;
  /** Drops what is waiting and stops what is being said. */
  clear: () => void;
  /** Sentences not yet finished (the one being said included). */
  pending: () => number;
}

export const createSpeechQueue = (engine: SpeechEngine): SpeechQueue => {
  const waiting: string[] = [];
  let speaking = false;
  // Bumped by clear(): a `done` from a cancelled sentence must not start the next one twice.
  let generation = 0;

  const next = () => {
    const text = waiting.shift();
    if (text === undefined) {
      speaking = false;
      return;
    }
    speaking = true;
    const mine = generation;
    engine.speak(text, () => {
      if (mine === generation) next();
    });
  };

  return {
    say: (text) => {
      if (text.trim() === '') return;
      waiting.push(text);
      if (!speaking) next();
    },
    clear: () => {
      generation += 1;
      waiting.length = 0;
      if (speaking) engine.cancel();
      speaking = false;
    },
    pending: () => waiting.length + (speaking ? 1 : 0),
  };
};
