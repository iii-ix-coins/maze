import { describe, expect, it } from 'vitest';
import { formatAmount, formatInteger, formatUsd, formatRegular } from './formatters';

describe('site number formatters', () => {
  it('keeps the existing compact amount and USD presentation', () => {
    expect(formatAmount(1_250_000)).toBe('1.25M');
    expect(formatUsd(1_250_000)).toBe('$1.25M');
  });

  it('preserves exact integer strings when formatting counts', () => {
    expect(formatInteger('1234567')).toBe('1,234,567');
  });

  it('formats regular decimal amounts without grouping', () => {
    expect(formatRegular(1234.5)).toBe('1234.5');
  });
});
