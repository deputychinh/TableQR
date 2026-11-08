import type { VoiceLevel } from './browser-speech';

/**
 * The cook's voice choices (TQR-027), remembered per device (each iPad decides for itself). The
 * browser's storage can be missing or refuse (private mode, blocked site data): then the screen
 * simply starts with the voice off.
 */
export const VOICE_RATES = ['slow', 'normal', 'fast'] as const;
export const VOICE_VOLUMES = ['low', 'medium', 'high'] as const;

export type VoiceRate = (typeof VOICE_RATES)[number];
export type VoiceVolume = (typeof VOICE_VOLUMES)[number];

export interface VoiceSettings {
  enabled: boolean;
  rate: VoiceRate;
  volume: VoiceVolume;
}

export const VOICE_STORAGE_KEY = 'tqr.kitchen.voice';

export const DEFAULT_VOICE: VoiceSettings = { enabled: false, rate: 'normal', volume: 'high' };

const RATE: Record<VoiceRate, number> = { slow: 0.8, normal: 1, fast: 1.2 };
const VOLUME: Record<VoiceVolume, number> = { low: 0.4, medium: 0.7, high: 1 };

export const levelOf = (settings: VoiceSettings): VoiceLevel => ({
  rate: RATE[settings.rate],
  volume: VOLUME[settings.volume],
});

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.find((v) => v === value) ?? fallback;

const storageOf = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // Access itself can throw (blocked site data): no memory, defaults.
    return undefined;
  }
};

export const loadVoiceSettings = (storage = storageOf()): VoiceSettings => {
  try {
    const raw = storage?.getItem(VOICE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE };
    const stored = JSON.parse(raw) as Record<string, unknown>;
    return {
      enabled: stored.enabled === true,
      rate: oneOf(VOICE_RATES, stored.rate, DEFAULT_VOICE.rate),
      volume: oneOf(VOICE_VOLUMES, stored.volume, DEFAULT_VOICE.volume),
    };
  } catch {
    // Unreadable or corrupt memory: start from the defaults (voice off), never break the screen.
    return { ...DEFAULT_VOICE };
  }
};

/** False when the device would not remember (the choice still holds until the page closes). */
export const saveVoiceSettings = (settings: VoiceSettings, storage = storageOf()): boolean => {
  try {
    if (!storage) return false;
    storage.setItem(VOICE_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    // Full or blocked storage: the choice lives until the page closes.
    return false;
  }
};
