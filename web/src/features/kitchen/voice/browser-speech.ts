import type { SpeechEngine } from './speech-queue';

/**
 * The browser's own speech synthesis (Web Speech API) as a `SpeechEngine` (TQR-027): Vietnamese,
 * on the device, no network and no service of ours. iPad has the Vietnamese voice "Linh".
 */
export interface VoiceLevel {
  rate: number;
  volume: number;
}

interface SpeechWindow {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

/** A Vietnamese voice, "Linh" (iOS/macOS) first; undefined → the browser picks from `lang`. */
export const pickVietnameseVoice = (
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined => {
  const vietnamese = voices.filter((v) => /^vi([-_]|$)/i.test(v.lang));
  return vietnamese.find((v) => /linh/i.test(v.name)) ?? vietnamese[0];
};

/**
 * Longest a sentence may take before the queue moves on anyway: some browsers never fire `end`
 * (a known Safari and Chrome bug), and a stuck sentence must not silence the kitchen.
 */
export const guardMs = (text: string, rate: number): number =>
  Math.round(3_000 + (text.length * 150) / Math.max(rate, 0.5));

/** Undefined when this browser cannot speak (the toggle then says so). */
export const browserSpeech = (
  level: () => VoiceLevel,
  win: SpeechWindow = window as SpeechWindow,
): (SpeechEngine & { unlock: () => void }) | undefined => {
  const synth = win.speechSynthesis;
  const Utterance = win.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return undefined;

  const utterance = (text: string) => {
    const u = new Utterance(text);
    u.lang = 'vi-VN';
    const voice = pickVietnameseVoice(synth.getVoices());
    if (voice) u.voice = voice;
    const { rate, volume } = level();
    u.rate = rate;
    u.volume = volume;
    return u;
  };

  return {
    speak: (text, done) => {
      const u = utterance(text);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        done();
      };
      const timer = setTimeout(finish, guardMs(text, u.rate));
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
    },
    cancel: () => {
      synth.cancel();
    },
    /**
     * iOS speaks only after a tap on the page. A remembered "on" after a reload is unlocked by the
     * cook's first tap anywhere: an empty sentence is enough.
     */
    unlock: () => {
      const u = utterance('');
      u.volume = 0;
      synth.speak(u);
    },
  };
};
