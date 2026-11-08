import type { Ticket } from '../services/kitchen.service';

/**
 * What the kitchen screen says aloud (TQR-027/028). Pure: tickets in, Vietnamese sentences out.
 *
 * The spoken grammar (number words, word order, "ghi chú", "chưa ra món") is Vietnamese-only logic
 * rather than display copy, so it lives here next to its tests instead of in the locale table.
 */

const UNITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const;

/** 1–20 as Vietnamese words ("mười lăm", "hai mươi"); anything else as digits. */
export const numberWords = (n: number): string => {
  if (!Number.isInteger(n) || n < 1 || n > 20) return String(n);
  if (n === 20) return 'hai mươi';
  if (n < 10) return UNITS[n] ?? String(n);
  if (n === 10) return 'mười';
  // 15 is "mười lăm", never "mười năm".
  return `mười ${n === 15 ? 'lăm' : (UNITS[n - 10] ?? String(n - 10))}`;
};

/** One line of speech: no line breaks or runs of spaces, first letter lower-case ("phở bò"). */
const spoken = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.charAt(0).toLocaleLowerCase('vi') + clean.slice(1);
};

type Line = Pick<Ticket, 'name' | 'quantity' | 'note'>;

/** "hai phở bò", "một trà đá, ghi chú: ít đá". */
export const linePhrase = (line: Line): string => {
  const dish = `${numberWords(line.quantity)} ${spoken(line.name)}`;
  const note = line.note === null ? '' : spoken(line.note);
  return note === '' ? dish : `${dish}, ghi chú: ${note}`;
};

export type OrderTicket = Pick<
  Ticket,
  'id' | 'orderId' | 'tableName' | 'name' | 'quantity' | 'note'
>;

/** The lines of each order together, orders in the order they came (the queue's). */
export const groupByOrder = <T extends Pick<Ticket, 'orderId'>>(items: readonly T[]): T[][] => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.orderId);
    if (group) group.push(item);
    else groups.set(item.orderId, [item]);
  }
  return [...groups.values()];
};

/**
 * One new order: "Bàn 1: hai phở bò, một trà đá". When a line has a note, lines are separated by
 * ";" so the note is heard as part of its own dish.
 */
export const orderPhrase = (lines: readonly OrderTicket[]): string => {
  const first = lines[0];
  if (!first) return '';
  const separator = lines.some((l) => l.note !== null && l.note.trim() !== '') ? '; ' : ', ';
  return `${first.tableName}: ${lines.map(linePhrase).join(separator)}`;
};

/** Every new order in the batch, one sentence each. */
export const newOrderPhrases = (items: readonly OrderTicket[]): string[] =>
  groupByOrder(items).map(orderPhrase);

export interface OverdueLine {
  tableName: string;
  name: string;
  quantity: number;
  /** Whole minutes the dish has waited. */
  minutes: number;
}

/** At most this many dishes are named in one reminder; the rest are counted. */
export const MAX_PER_REMINDER = 3;

/**
 * "Bàn 5 gọi phở bò đã 10 phút, chưa ra món"; several dishes that came due together share one
 * sentence, oldest first, the fourth onwards counted ("và hai món khác").
 */
export const reminderPhrase = (lines: readonly OverdueLine[]): string => {
  if (lines.length === 0) return '';
  const named = lines.slice(0, MAX_PER_REMINDER).map((line) => {
    const amount = line.quantity > 1 ? `${numberWords(line.quantity)} ` : '';
    return `${line.tableName} gọi ${amount}${spoken(line.name)} đã ${String(line.minutes)} phút`;
  });
  const rest = lines.length - named.length;
  const others = rest > 0 ? [`và ${numberWords(rest)} món khác`] : [];
  return [...named, ...others, 'chưa ra món'].join(', ');
};
