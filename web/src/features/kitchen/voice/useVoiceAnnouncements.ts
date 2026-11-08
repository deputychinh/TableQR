import { watch, type Ref } from 'vue';
import type { Ticket } from '../services/kitchen.service';
import { waitedMinutes } from '../queue-state';
import { createArrivalTracker } from './arrivals';
import { newOrderPhrases, reminderPhrase } from './phrases';
import { dueReminders, markSaid, type ReminderRule } from './scheduler';

/**
 * Wires one station's live queue to speech (TQR-027/028): new dishes as they arrive, grouped per
 * order, and overdue reminders on the server-corrected clock. It only decides *what* to say;
 * `say` (the page's speech queue) decides how.
 *
 * New dishes are tracked even while the voice is off, so turning it on never reads a backlog.
 * Reminders are only marked as said while the voice is on, so turning it on reminds at once.
 */
export const useVoiceAnnouncements = (options: {
  items: Ref<readonly Ticket[]>;
  loaded: Ref<boolean>;
  now: Ref<number>;
  reminder: Ref<ReminderRule>;
  enabled: Ref<boolean>;
  say: (text: string) => void;
}) => {
  const { items, loaded, now, reminder, enabled, say } = options;
  const arrivals = createArrivalTracker();
  const said = new Map<string, number>();

  watch(
    [items, loaded],
    () => {
      if (!loaded.value) return;
      const fresh = arrivals.take(items.value);
      if (enabled.value) for (const phrase of newOrderPhrases(fresh)) say(phrase);
    },
    { immediate: true },
  );

  const remind = () => {
    if (!loaded.value || !enabled.value) return;
    const due = dueReminders(items.value, now.value, reminder.value, said);
    markSaid(said, items.value, due, now.value);
    if (due.length === 0) return;
    say(
      reminderPhrase(
        due.map((item) => ({
          tableName: item.tableName,
          name: item.name,
          quantity: item.quantity,
          minutes: waitedMinutes(item, now.value),
        })),
      ),
    );
  };

  watch([now, enabled, loaded, reminder], remind, { immediate: true });
};
