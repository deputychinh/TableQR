import { effectScope, nextTick, ref } from 'vue';
import type { Ticket } from '../services/kitchen.service';
import { createArrivalTracker } from './arrivals';
import { browserSpeech, guardMs, pickVietnameseVoice } from './browser-speech';
import {
  MAX_PER_REMINDER,
  groupByOrder,
  linePhrase,
  newOrderPhrases,
  numberWords,
  orderPhrase,
  reminderPhrase,
} from './phrases';
import { dueReminders, isOverdue, markSaid, type ReminderRule } from './scheduler';
import {
  DEFAULT_VOICE,
  VOICE_STORAGE_KEY,
  levelOf,
  loadVoiceSettings,
  saveVoiceSettings,
} from './settings';
import { createSpeechQueue, type SpeechEngine } from './speech-queue';
import { useVoiceAnnouncements } from './useVoiceAnnouncements';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const MIN = 60_000;
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

const ticket = (id: string, over: Partial<Ticket> = {}): Ticket => ({
  id,
  version: 1,
  status: 'waiting',
  orderId: `o-${id}`,
  menuItemId: 'pho',
  name: 'Phở bò',
  quantity: 1,
  note: null,
  sessionId: 's1',
  tableName: 'Bàn 1',
  partySize: 2,
  queueAt: ago(0),
  startedAt: null,
  lateAt: ago(-15),
  ...over,
});

describe('numberWords (Vietnamese 1–20, digits otherwise)', () => {
  it.each([
    [1, 'một'],
    [2, 'hai'],
    [4, 'bốn'],
    [5, 'năm'],
    [7, 'bảy'],
    [9, 'chín'],
    [10, 'mười'],
    [11, 'mười một'],
    [14, 'mười bốn'],
    [15, 'mười lăm'],
    [19, 'mười chín'],
    [20, 'hai mươi'],
  ])('%i → %s', (n, words) => {
    expect(numberWords(n)).toBe(words);
  });

  it.each([0, 21, 34, -1, 2.5])('falls back to digits for %s', (n) => {
    expect(numberWords(n)).toBe(String(n));
  });
});

describe('new order phrases (TQR-027)', () => {
  it('reads quantity in words and the dish in lower case', () => {
    expect(linePhrase({ name: 'Phở bò', quantity: 2, note: null })).toBe('hai phở bò');
  });

  it('reads the note after its dish, tidied to one line', () => {
    expect(linePhrase({ name: 'Trà đá', quantity: 1, note: '  Ít đá,\n không đường ' })).toBe(
      'một trà đá, ghi chú: ít đá, không đường',
    );
    expect(linePhrase({ name: 'Trà đá', quantity: 1, note: '   ' })).toBe('một trà đá');
  });

  it('says one order as one sentence: "Bàn 1: hai phở bò, một trà đá"', () => {
    const lines = [
      ticket('a', { orderId: 'o1', quantity: 2 }),
      ticket('b', { orderId: 'o1', name: 'Trà đá' }),
    ];
    expect(orderPhrase(lines)).toBe('Bàn 1: hai phở bò, một trà đá');
  });

  it('separates lines with ";" when a note is read, so the note stays with its dish', () => {
    const lines = [
      ticket('a', { orderId: 'o1', quantity: 2, note: 'Không hành' }),
      ticket('b', { orderId: 'o1', name: 'Trà đá' }),
    ];
    expect(orderPhrase(lines)).toBe('Bàn 1: hai phở bò, ghi chú: không hành; một trà đá');
  });

  it('keeps 21 and more as digits', () => {
    expect(orderPhrase([ticket('a', { quantity: 25 })])).toBe('Bàn 1: 25 phở bò');
  });

  it('groups lines per order, orders in queue order, even when lines of orders interleave', () => {
    const items = [
      ticket('a', { orderId: 'o1' }),
      ticket('b', { orderId: 'o2', tableName: 'Bàn 2' }),
      ticket('c', { orderId: 'o1', name: 'Trà đá', quantity: 3 }),
    ];
    expect(groupByOrder(items).map((g) => g.map((i) => i.id))).toEqual([['a', 'c'], ['b']]);
    expect(newOrderPhrases(items)).toEqual(['Bàn 1: một phở bò, ba trà đá', 'Bàn 2: một phở bò']);
    expect(newOrderPhrases([])).toEqual([]);
    expect(orderPhrase([])).toBe('');
  });
});

describe('reminder phrases (TQR-028)', () => {
  const line = (tableName: string, name: string, minutes: number, quantity = 1) => ({
    tableName,
    name,
    quantity,
    minutes,
  });

  it('says "Bàn 5 gọi phở bò đã 10 phút, chưa ra món"', () => {
    expect(reminderPhrase([line('Bàn 5', 'Phở bò', 10)])).toBe(
      'Bàn 5 gọi phở bò đã 10 phút, chưa ra món',
    );
  });

  it('names the quantity when more than one', () => {
    expect(reminderPhrase([line('Bàn 2', 'Bún chả', 12, 3)])).toBe(
      'Bàn 2 gọi ba bún chả đã 12 phút, chưa ra món',
    );
  });

  it('puts dishes due together in one sentence, oldest first', () => {
    expect(reminderPhrase([line('Bàn 5', 'Phở bò', 14), line('Bàn 2', 'Trà đá', 11)])).toBe(
      'Bàn 5 gọi phở bò đã 14 phút, Bàn 2 gọi trà đá đã 11 phút, chưa ra món',
    );
  });

  it(`names at most ${String(MAX_PER_REMINDER)} dishes and counts the rest`, () => {
    const lines = [1, 2, 3, 4, 5].map((n) => line(`Bàn ${String(n)}`, 'Phở bò', 20 - n));
    expect(reminderPhrase(lines)).toBe(
      'Bàn 1 gọi phở bò đã 19 phút, Bàn 2 gọi phở bò đã 18 phút, Bàn 3 gọi phở bò đã 17 phút, ' +
        'và hai món khác, chưa ra món',
    );
    expect(reminderPhrase([])).toBe('');
  });
});

describe('reminder scheduler (TQR-028)', () => {
  const rule: ReminderRule = { minutes: 10, repeatMinutes: 5 };

  it('is overdue from exactly the rule’s minutes', () => {
    expect(isOverdue(ticket('a', { queueAt: ago(10) }), NOW, rule)).toBe(true);
    expect(isOverdue(ticket('a', { queueAt: ago(9.99) }), NOW, rule)).toBe(false);
  });

  it('gives overdue dishes never said, in queue order, waiting or cooking', () => {
    const items = [
      ticket('old', { queueAt: ago(14), status: 'cooking' }),
      ticket('mid', { queueAt: ago(11) }),
      ticket('new', { queueAt: ago(3) }),
    ];
    expect(dueReminders(items, NOW, rule, new Map()).map((i) => i.id)).toEqual(['old', 'mid']);
  });

  it('repeats a dish only after the repeat interval', () => {
    const items = [ticket('a', { queueAt: ago(12) })];
    const said = new Map<string, number>();
    markSaid(said, items, items, NOW);
    expect(dueReminders(items, NOW + 4.9 * MIN, rule, said)).toEqual([]);
    expect(dueReminders(items, NOW + 5 * MIN, rule, said).map((i) => i.id)).toEqual(['a']);
  });

  it('forgets dishes that left the queue (done, served, cancelled)', () => {
    const a = ticket('a', { queueAt: ago(12) });
    const b = ticket('b', { queueAt: ago(12) });
    const said = new Map<string, number>();
    markSaid(said, [a, b], [a, b], NOW);
    markSaid(said, [b], [], NOW + MIN);
    expect([...said.keys()]).toEqual(['b']);
  });

  it('counts on the clock it is given (the server-corrected one), not the device clock', () => {
    const items = [ticket('a', { queueAt: ago(0) })];
    expect(dueReminders(items, NOW + 10 * MIN, rule, new Map())).toHaveLength(1);
  });
});

describe('arrival tracker (dedupe by item id)', () => {
  it('reads nothing of the first list, then only dishes never seen before', () => {
    const tracker = createArrivalTracker();
    expect(tracker.take([ticket('a'), ticket('b')])).toEqual([]);
    expect(tracker.take([ticket('a'), ticket('b'), ticket('c')]).map((i) => i.id)).toEqual(['c']);
  });

  it('never reads old dishes again after a reconnect snapshot', () => {
    const tracker = createArrivalTracker();
    tracker.take([ticket('a')]);
    tracker.take([ticket('a'), ticket('b')]);
    expect(tracker.take([ticket('b', { status: 'cooking' }), ticket('a')])).toEqual([]);
  });

  it('reads a dish that arrived while the stream was down, but not one already being cooked', () => {
    const tracker = createArrivalTracker();
    tracker.take([]);
    expect(
      tracker.take([ticket('x'), ticket('y', { status: 'cooking' })]).map((i) => i.id),
    ).toEqual(['x']);
  });
});

/** A fake engine: records what was said; the test ends sentences by hand. */
const fakeEngine = () => {
  const spoken: string[] = [];
  const ends: (() => void)[] = [];
  let cancels = 0;
  const engine: SpeechEngine = {
    speak: (text, done) => {
      spoken.push(text);
      ends.push(done);
    },
    cancel: () => {
      cancels += 1;
      ends.at(-1)?.();
    },
  };
  return { engine, spoken, ends, cancels: () => cancels };
};

describe('speech queue (never two voices at once)', () => {
  it('says sentences one after the other', () => {
    const { engine, spoken, ends } = fakeEngine();
    const queue = createSpeechQueue(engine);
    queue.say('một');
    queue.say('hai');
    expect(spoken).toEqual(['một']);
    expect(queue.pending()).toBe(2);
    ends[0]?.();
    expect(spoken).toEqual(['một', 'hai']);
    ends[1]?.();
    expect(queue.pending()).toBe(0);
    queue.say('ba');
    expect(spoken).toEqual(['một', 'hai', 'ba']);
  });

  it('ignores empty sentences', () => {
    const { engine, spoken } = fakeEngine();
    createSpeechQueue(engine).say('  ');
    expect(spoken).toEqual([]);
  });

  it('clear drops what waits and stops the voice without starting the next sentence', () => {
    const { engine, spoken, cancels } = fakeEngine();
    const queue = createSpeechQueue(engine);
    queue.say('một');
    queue.say('hai');
    queue.clear();
    expect(cancels()).toBe(1);
    expect(spoken).toEqual(['một']);
    expect(queue.pending()).toBe(0);
    queue.clear();
    expect(cancels()).toBe(1);
    queue.say('ba');
    expect(spoken).toEqual(['một', 'ba']);
  });
});

/** A fake `speechSynthesis` + `SpeechSynthesisUtterance` (jsdom has neither). */
class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}
const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
const fakeSynth = (voices: SpeechSynthesisVoice[] = []) => {
  const said: FakeUtterance[] = [];
  return {
    said,
    synth: {
      speak: (u: FakeUtterance) => said.push(u),
      cancel: vi.fn<() => void>(),
      getVoices: () => voices,
    } as unknown as SpeechSynthesis,
  };
};

describe('browser speech adapter', () => {
  afterEach(() => vi.useRealTimers());

  it('prefers the Vietnamese voice "Linh", else any Vietnamese voice, else none', () => {
    const linh = voice('Linh', 'vi-VN');
    const other = voice('An', 'vi_VN');
    expect(pickVietnameseVoice([voice('Samantha', 'en-US'), other, linh])).toBe(linh);
    expect(pickVietnameseVoice([voice('Samantha', 'en-US'), other])).toBe(other);
    expect(pickVietnameseVoice([voice('Samantha', 'en-US')])).toBeUndefined();
  });

  it('is unavailable without speechSynthesis', () => {
    expect(browserSpeech(() => ({ rate: 1, volume: 1 }), {})).toBeUndefined();
  });

  it('speaks Vietnamese at the chosen rate and volume and reports the end once', () => {
    const { synth, said } = fakeSynth([voice('Linh', 'vi-VN')]);
    const engine = browserSpeech(() => ({ rate: 0.8, volume: 0.4 }), {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
    });
    const done = vi.fn<() => void>();
    engine?.speak('Bàn 1: hai phở bò', done);
    const u = said[0];
    expect(u).toMatchObject({ text: 'Bàn 1: hai phở bò', lang: 'vi-VN', rate: 0.8, volume: 0.4 });
    expect(u?.voice?.name).toBe('Linh');
    u?.onend?.();
    u?.onerror?.();
    expect(done).toHaveBeenCalledTimes(1);
    engine?.cancel();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('moves on when the browser never says the sentence ended', () => {
    vi.useFakeTimers();
    const { synth } = fakeSynth();
    const engine = browserSpeech(() => ({ rate: 1, volume: 1 }), {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
    });
    const done = vi.fn<() => void>();
    engine?.speak('Bàn 1: một phở bò', done);
    vi.advanceTimersByTime(guardMs('Bàn 1: một phở bò', 1));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('unlocks iOS speech with a silent empty sentence', () => {
    const { synth, said } = fakeSynth();
    browserSpeech(() => ({ rate: 1, volume: 1 }), {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
    })?.unlock();
    expect(said[0]).toMatchObject({ text: '', volume: 0 });
  });
});

describe('voice settings (per device)', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    } as unknown as Storage;
  };

  it('start off and come back as saved', () => {
    const storage = memory();
    expect(loadVoiceSettings(storage)).toEqual(DEFAULT_VOICE);
    expect(saveVoiceSettings({ enabled: true, rate: 'slow', volume: 'low' }, storage)).toBe(true);
    expect(loadVoiceSettings(storage)).toEqual({ enabled: true, rate: 'slow', volume: 'low' });
    expect(levelOf({ enabled: true, rate: 'slow', volume: 'low' })).toEqual({
      rate: 0.8,
      volume: 0.4,
    });
  });

  it('fall back to defaults for corrupt or unknown values', () => {
    const storage = memory();
    storage.setItem(VOICE_STORAGE_KEY, '{oops');
    expect(loadVoiceSettings(storage)).toEqual(DEFAULT_VOICE);
    storage.setItem(VOICE_STORAGE_KEY, JSON.stringify({ enabled: 'yes', rate: 'warp' }));
    expect(loadVoiceSettings(storage)).toEqual(DEFAULT_VOICE);
  });

  it('survive storage that refuses (private mode) or is missing', () => {
    const refusing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(loadVoiceSettings(refusing)).toEqual(DEFAULT_VOICE);
    expect(saveVoiceSettings(DEFAULT_VOICE, refusing)).toBe(false);
    expect(saveVoiceSettings(DEFAULT_VOICE, undefined)).toBe(false);
    expect(loadVoiceSettings(undefined)).toEqual(DEFAULT_VOICE);
  });

  it('use the browser’s localStorage by default, and start off when reaching it throws', () => {
    vi.stubGlobal('localStorage', memory());
    saveVoiceSettings({ ...DEFAULT_VOICE, enabled: true });
    expect(loadVoiceSettings().enabled).toBe(true);
    vi.unstubAllGlobals();
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE);
    spy.mockRestore();
  });
});

describe('useVoiceAnnouncements (stream → sentences)', () => {
  const setup = (enabled = true, rule: ReminderRule = { minutes: 10, repeatMinutes: 10 }) => {
    const items = ref<readonly Ticket[]>([]);
    const loaded = ref(false);
    const now = ref(NOW);
    const on = ref(enabled);
    const said: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      useVoiceAnnouncements({
        items,
        loaded,
        now,
        reminder: ref(rule),
        enabled: on,
        say: (text) => said.push(text),
      });
    });
    return { items, loaded, now, on, said, scope };
  };

  it('reads only orders that arrive after the screen started listening', async () => {
    const s = setup();
    s.items.value = [ticket('old', { tableName: 'Bàn 9' })];
    s.loaded.value = true;
    await nextTick();
    expect(s.said).toEqual([]);
    s.items.value = [
      ...s.items.value,
      ticket('a', { orderId: 'o1', quantity: 2 }),
      ticket('b', { orderId: 'o1', name: 'Trà đá' }),
    ];
    await nextTick();
    expect(s.said).toEqual(['Bàn 1: hai phở bò, một trà đá']);
    s.scope.stop();
  });

  it('keeps track while off, so turning on never reads a backlog', async () => {
    const s = setup(false);
    s.loaded.value = true;
    await nextTick();
    s.items.value = [ticket('a')];
    await nextTick();
    s.on.value = true;
    await nextTick();
    s.items.value = [ticket('a'), ticket('b', { tableName: 'Bàn 2' })];
    await nextTick();
    expect(s.said).toEqual(['Bàn 2: một phở bò']);
    s.scope.stop();
  });

  it('reminds overdue dishes on the server clock and repeats until they leave', async () => {
    const s = setup(true, { minutes: 10, repeatMinutes: 10 });
    s.items.value = [ticket('a', { tableName: 'Bàn 5', queueAt: ago(8) })];
    s.loaded.value = true;
    await nextTick();
    expect(s.said).toEqual([]);
    s.now.value = NOW + 2 * MIN;
    await nextTick();
    expect(s.said).toEqual(['Bàn 5 gọi phở bò đã 10 phút, chưa ra món']);
    s.now.value = NOW + 7 * MIN;
    await nextTick();
    expect(s.said).toHaveLength(1);
    s.now.value = NOW + 12 * MIN;
    await nextTick();
    expect(s.said.at(-1)).toBe('Bàn 5 gọi phở bò đã 20 phút, chưa ra món');
    s.items.value = [];
    s.now.value = NOW + 30 * MIN;
    await nextTick();
    expect(s.said).toHaveLength(2);
    s.scope.stop();
  });

  it('does not remind while the voice is off, and reminds at once when it is turned on', async () => {
    const s = setup(false);
    s.items.value = [ticket('a', { tableName: 'Bàn 5', queueAt: ago(12) })];
    s.loaded.value = true;
    await nextTick();
    expect(s.said).toEqual([]);
    s.on.value = true;
    await nextTick();
    expect(s.said).toEqual(['Bàn 5 gọi phở bò đã 12 phút, chưa ra món']);
    s.scope.stop();
  });
});
