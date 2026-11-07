import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { QR_OPTIONS, byTableName, guestTableUrl, qrSvgDataUrl } from './qr';
import { describeTableError } from './errors';
import { ApiError } from '@/api/client';

const TOKEN = 'Zm9vYmFyYmF6cXV4MTIzNA';
const URL_TEXT = `https://quan.tableqr.vn/t/${TOKEN}`;
const SCALE = 4;

/** Rasterises the QR matrix the way the SVG draws it (dark modules black, 4-module margin). */
const rasterise = (text: string) => {
  const { modules } = QRCode.create(text, QR_OPTIONS);
  const cells = modules.size + QR_OPTIONS.margin * 2;
  const width = cells * SCALE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (!modules.get(y, x)) continue;
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          const px = (x + QR_OPTIONS.margin) * SCALE + dx;
          const py = (y + QR_OPTIONS.margin) * SCALE + dy;
          const i = (py * width + px) * 4;
          pixels[i] = 0;
          pixels[i + 1] = 0;
          pixels[i + 2] = 0;
        }
      }
    }
  }
  return { pixels, width, modules };
};

describe('guest table URL', () => {
  it('is the app origin + /t/<token> (AC8)', () => {
    expect(guestTableUrl('https://quan.tableqr.vn', TOKEN)).toBe(URL_TEXT);
  });

  it('does not double the slash when the origin ends with one', () => {
    expect(guestTableUrl('https://quan.tableqr.vn//', TOKEN)).toBe(URL_TEXT);
  });

  it('escapes anything that is not URL-safe in a token', () => {
    expect(guestTableUrl('http://localhost', 'a/b?c')).toBe('http://localhost/t/a%2Fb%3Fc');
  });
});

describe('QR code', () => {
  it('decodes back to the exact guest URL, as a phone camera would read it', () => {
    const { pixels, width } = rasterise(URL_TEXT);
    const decoded = jsQR(pixels, width, width);
    expect(decoded?.data).toBe(URL_TEXT);
  });

  it('uses error correction M and the standard 4-module quiet zone', () => {
    const { errorCorrectionLevel } = QRCode.create(URL_TEXT, QR_OPTIONS);
    expect(errorCorrectionLevel.bit).toBe(
      QRCode.create('x', { errorCorrectionLevel: 'M' }).errorCorrectionLevel.bit,
    );
    expect(QR_OPTIONS.margin).toBe(4);
  });

  it('renders an SVG data URL of the same matrix (no third-party image service)', async () => {
    const { modules } = rasterise(URL_TEXT);
    const url = await qrSvgDataUrl(URL_TEXT);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(url.split(',')[1] ?? '');
    const side = modules.size + QR_OPTIONS.margin * 2;
    expect(svg).toContain(`viewBox="0 0 ${String(side)} ${String(side)}"`);
    expect(svg).toContain('#000000');
  });
});

describe('table order', () => {
  it('sorts names naturally: Bàn 2 before Bàn 10, ignoring letter case', () => {
    const names = ['Bàn 10', 'bàn 2', 'Bàn 1', 'Sân vườn'].map((name) => ({ name }));
    expect(names.sort(byTableName).map((t) => t.name)).toEqual([
      'Bàn 1',
      'bàn 2',
      'Bàn 10',
      'Sân vườn',
    ]);
  });
});

describe('describeTableError', () => {
  it.each([
    [new ApiError(409, 'TABLE_NAME_TAKEN'), { name: 'tables.errors.nameTaken' }],
    [new ApiError(409, 'TABLE_LIMIT_REACHED'), { form: 'tables.errors.limit' }],
    [new ApiError(404, 'NOT_FOUND'), { form: 'tables.errors.gone' }],
    [new ApiError(0, 'NETWORK'), { form: 'errors.network' }],
    [new ApiError(500, 'INTERNAL'), { form: 'errors.unexpected' }],
    [new Error('boom'), { form: 'errors.unexpected' }],
    [
      new ApiError(422, 'VALIDATION_FAILED', [
        { path: 'name', code: 'custom' },
        { path: 'seats', code: 'custom' },
      ]),
      { name: 'tables.errors.name', seats: 'tables.errors.seats' },
    ],
    [
      new ApiError(422, 'VALIDATION_FAILED', [{ path: '(body)', code: 'unrecognized_keys' }]),
      { form: 'errors.unexpected' },
    ],
  ])('maps %o', (error, expected) => {
    expect(describeTableError(error)).toEqual(expected);
  });
});
