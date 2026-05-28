/**
 * Money math kept in one place so rounding rules are consistent across
 * Orders, Coupons, Payments, etc. All values are stored as units of the
 * primary currency (₹ for now) with two decimal places.
 */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const applyPercent = (amount: number, percent: number): number =>
  round2((amount * percent) / 100);

export const clampNonNegative = (n: number): number => (n < 0 ? 0 : n);
