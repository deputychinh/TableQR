import { crc16Hex } from './crc16.js';

/**
 * VietQR payload (ADR 0006): EMVCo merchant-presented QR with the NAPAS profile.
 *
 *   00=01 · 01=12 (dynamic: carries an amount) · 38={00=A000000727, 01={00=BIN, 01=account},
 *   02=QRIBFTTA} · 53=704 (VND) · 54=amount · 58=VN · 62={08=memo} · 63=CRC-16/CCITT-FALSE
 *
 * The CRC covers the whole string including the `6304` that introduces it. Pure: no I/O.
 */

export const NAPAS_AID = 'A000000727';
export const SERVICE_TO_ACCOUNT = 'QRIBFTTA';
const CURRENCY_VND = '704';
const COUNTRY_VN = 'VN';
const CRC_TAG_AND_LENGTH = '6304';
const MAX_VALUE_LENGTH = 99;

/** EMVCo tag 54 is at most 13 characters; VND has no decimals, so 13 digits. */
export const AMOUNT_MAX_DIGITS = 13;
export const AMOUNT_MAX = 10 ** AMOUNT_MAX_DIGITS - 1;
/** Tag 62-08 (purpose of transaction) is at most 25 characters. */
export const MEMO_MAX = 25;

const BIN_PATTERN = /^\d{6}$/;
const ACCOUNT_PATTERN = /^[0-9A-Za-z]{1,19}$/;
/** Banks drop or reject anything else in the transfer note. */
const MEMO_PATTERN = /^[0-9A-Za-z ]+$/;

export interface VietQrInput {
  bin: string;
  accountNumber: string;
  amountVnd: number;
  memo: string;
  /** `dynamic` (01=12, default: amount present, single use) or `static` (01=11). */
  initiation?: 'dynamic' | 'static';
}

export class VietQrInputError extends Error {
  constructor(readonly field: keyof VietQrInput) {
    super(`invalid VietQR ${field}`);
    this.name = 'VietQrInputError';
  }
}

/** One TLV field: 2-digit id, 2-digit length, value. */
export const tlv = (id: string, value: string): string => {
  if (value.length === 0 || value.length > MAX_VALUE_LENGTH) {
    throw new RangeError(`TLV ${id} value length ${String(value.length)} out of range`);
  }
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
};

const isValidAmount = (amount: number): boolean =>
  Number.isSafeInteger(amount) && amount >= 1 && amount <= AMOUNT_MAX;

/** Builds the payload string; throws `VietQrInputError` for input a bank app would refuse. */
export const buildVietQr = (input: VietQrInput): string => {
  if (!BIN_PATTERN.test(input.bin)) throw new VietQrInputError('bin');
  if (!ACCOUNT_PATTERN.test(input.accountNumber)) throw new VietQrInputError('accountNumber');
  if (!isValidAmount(input.amountVnd)) throw new VietQrInputError('amountVnd');
  if (input.memo.length > MEMO_MAX || !MEMO_PATTERN.test(input.memo)) {
    throw new VietQrInputError('memo');
  }
  const beneficiary = tlv('00', input.bin) + tlv('01', input.accountNumber);
  const merchantAccount =
    tlv('00', NAPAS_AID) + tlv('01', beneficiary) + tlv('02', SERVICE_TO_ACCOUNT);
  const body =
    tlv('00', '01') +
    tlv('01', input.initiation === 'static' ? '11' : '12') +
    tlv('38', merchantAccount) +
    tlv('53', CURRENCY_VND) +
    tlv('54', String(input.amountVnd)) +
    tlv('58', COUNTRY_VN) +
    tlv('62', tlv('08', input.memo)) +
    CRC_TAG_AND_LENGTH;
  return body + crc16Hex(body);
};

/** Parses one level of TLV fields; throws on a truncated or malformed string. */
export const parseTlv = (text: string): Map<string, string> => {
  const fields = new Map<string, string>();
  let at = 0;
  while (at < text.length) {
    const id = text.slice(at, at + 2);
    const lengthText = text.slice(at + 2, at + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) {
      throw new SyntaxError(`bad TLV header at ${String(at)}`);
    }
    const length = Number(lengthText);
    const value = text.slice(at + 4, at + 4 + length);
    if (value.length !== length) throw new SyntaxError(`truncated TLV ${id}`);
    fields.set(id, value);
    at += 4 + length;
  }
  return fields;
};

export interface DecodedVietQr {
  initiation: 'dynamic' | 'static';
  aid: string;
  bin: string;
  accountNumber: string;
  service: string;
  currency: string;
  amountVnd: number | null;
  country: string;
  memo: string | null;
  crc: string;
  crcValid: boolean;
}

const required = (fields: Map<string, string>, id: string): string => {
  const value = fields.get(id);
  if (value === undefined) throw new SyntaxError(`missing tag ${id}`);
  return value;
};

/** Decodes a VietQR payload and checks its CRC (used by tests and as a self-check). */
export const decodeVietQr = (payload: string): DecodedVietQr => {
  const top = parseTlv(payload);
  const crc = required(top, '63');
  if (!payload.endsWith(CRC_TAG_AND_LENGTH + crc)) throw new SyntaxError('CRC must be last');
  const merchant = parseTlv(required(top, '38'));
  const beneficiary = parseTlv(required(merchant, '01'));
  const additional = top.has('62') ? parseTlv(required(top, '62')) : new Map<string, string>();
  const amount = top.get('54');
  return {
    initiation: required(top, '01') === '12' ? 'dynamic' : 'static',
    aid: required(merchant, '00'),
    bin: required(beneficiary, '00'),
    accountNumber: required(beneficiary, '01'),
    service: required(merchant, '02'),
    currency: required(top, '53'),
    amountVnd: amount === undefined ? null : Number(amount),
    country: required(top, '58'),
    memo: additional.get('08') ?? null,
    crc,
    crcValid: crc16Hex(payload.slice(0, -crc.length)) === crc,
  };
};
