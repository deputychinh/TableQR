import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode';

/**
 * Error correction M (15 % of the code can be damaged — a smudge or a fold on a printed card)
 * and the 4-module quiet zone the QR standard asks for, so phone cameras lock on quickly.
 */
export const QR_OPTIONS = {
  errorCorrectionLevel: 'M' as QRCodeErrorCorrectionLevel,
  margin: 4,
} as const;

/** The URL a table's QR code carries: this app's origin + `/t/<token>` (AC8). */
export const guestTableUrl = (origin: string, qrToken: string): string =>
  `${origin.replace(/\/+$/, '')}/t/${encodeURIComponent(qrToken)}`;

/** Renders a QR code client-side as an SVG data URL (no third-party image service, ADR 0006). */
export const qrSvgDataUrl = async (text: string): Promise<string> => {
  const svg = await QRCode.toString(text, {
    ...QR_OPTIONS,
    type: 'svg',
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** "Bàn 2" before "Bàn 10": natural, Vietnamese-aware order. */
export const byTableName = <T extends { name: string }>(a: T, b: T): number =>
  collator.compare(a.name, b.name);
