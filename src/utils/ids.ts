/**
 * Stable identifier generators used across modules. Keeping them here
 * (instead of inlining in services) makes test fixtures deterministic.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function orderNumber(prefix = 'LUM'): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${yyyymmdd}-${randomCode(6)}`;
}

export function invoiceNumber(prefix = 'INV'): string {
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  return `${prefix}-${yyyymm}-${randomCode(8)}`;
}
