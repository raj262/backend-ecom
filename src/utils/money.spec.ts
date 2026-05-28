import { applyPercent, clampNonNegative, round2 } from './money';

describe('money utils', () => {
  it('round2() rounds to two decimals', () => {
    expect(round2(10.126)).toBe(10.13);
    expect(round2(10.124)).toBe(10.12);
  });

  it('applyPercent() applies a percentage discount', () => {
    expect(applyPercent(1000, 10)).toBe(100);
  });

  it('clampNonNegative() floors at zero', () => {
    expect(clampNonNegative(-5)).toBe(0);
    expect(clampNonNegative(3)).toBe(3);
  });
});
