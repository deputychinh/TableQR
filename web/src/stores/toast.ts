import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastTone = 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** How long a message stays when nothing waits, and when another message is queued behind it. */
export const TOAST_MS = 5000;
export const TOAST_QUEUED_MS = 1500;

/**
 * The outcome of an action, one message at a time (design system `Toast`). Messages queue in
 * order; a message with others waiting stays only `TOAST_QUEUED_MS`, so a burst never lags.
 */
export const useToastStore = defineStore('toast', () => {
  const current = ref<Toast>();
  const queue = ref<Toast[]>([]);
  let nextId = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = 0;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(dismiss, ms);
  };

  const advance = () => {
    current.value = queue.value.shift();
    if (current.value) {
      shownAt = Date.now();
      schedule(queue.value.length > 0 ? TOAST_QUEUED_MS : TOAST_MS);
    }
  };

  /** Hides the current message (timer or the close button) and shows the next one. */
  const dismiss = () => {
    clearTimeout(timer);
    timer = undefined;
    advance();
  };

  const show = (message: string, tone: ToastTone = 'success') => {
    queue.value.push({ id: nextId++, message, tone });
    if (current.value === undefined) {
      advance();
    } else if (queue.value.length === 1) {
      // Something now waits: let the current one finish its short slot.
      schedule(Math.max(0, TOAST_QUEUED_MS - (Date.now() - shownAt)));
    }
  };

  return { current, queue, show, dismiss };
});
