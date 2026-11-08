import { onScopeDispose, watch, type Ref } from 'vue';
import type { StreamStatus } from '@/composables/useStream';

/** A connection down this long is said aloud; a shorter blip (a resync, a quick retry) is not. */
export const LOST_GRACE_MS = 5_000;

/**
 * Says aloud that the kitchen screen lost the server (TQR-031), so a cook who is not looking at the
 * iPad knows new orders are not arriving: `lost` once when the stream has been down for
 * `LOST_GRACE_MS` while the voice is on, then `back` once when it is live again. The very first
 * connection is never announced.
 */
export const useConnectionVoice = (options: {
  status: Ref<StreamStatus>;
  enabled: Ref<boolean>;
  say: (text: string) => void;
  lost: string;
  back: string;
}) => {
  const { status, enabled, say } = options;
  let wasLive = false;
  let announced = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  watch(status, (now) => {
    if (now === 'live') {
      stopTimer();
      wasLive = true;
      if (announced && enabled.value) say(options.back);
      announced = false;
      return;
    }
    if (now === 'ended') {
      // Revoked or signed out: the screen goes to sign-in; "lost" would be wrong.
      stopTimer();
      return;
    }
    if (!wasLive || timer !== undefined || announced) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (status.value === 'live' || !enabled.value) return;
      announced = true;
      say(options.lost);
    }, LOST_GRACE_MS);
  });

  onScopeDispose(stopTimer);
};
