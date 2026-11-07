/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final XOR) over the UTF-8 bytes
 * of `text` — the checksum EMVCo merchant-presented QR (and so VietQR, tag 63) uses.
 * Check value from the CRC catalogue: "123456789" → 0x29B1.
 */
const POLY = 0x1021;
const INIT = 0xffff;
const TOP_BIT = 0x8000;
const MASK = 0xffff;
const BITS_PER_BYTE = 8;

export const crc16CcittFalse = (text: string): number => {
  let crc = INIT;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << BITS_PER_BYTE;
    for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
      crc = (crc & TOP_BIT) !== 0 ? ((crc << 1) ^ POLY) & MASK : (crc << 1) & MASK;
    }
  }
  return crc;
};

/** The 4-character upper-case hex form written after `6304`. */
export const crc16Hex = (text: string): string =>
  crc16CcittFalse(text).toString(16).toUpperCase().padStart(4, '0');
