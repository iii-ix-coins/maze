const locale = 'en-US';

function normalizeNumeric(value: unknown): number | bigint {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value).trim().replace(/,/g, '').replace(/^\$/, '');
  if (!normalized) return 0;
  if (/^-?\d+$/.test(normalized)) {
    try {
      return BigInt(normalized);
    } catch {
      // Fall through to a Number for out-of-range integer representations.
    }
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

const amountFormatter = new Intl.NumberFormat(locale, {
  notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 2,
  minimumFractionDigits: 0, useGrouping: false,
});
const usdFormatter = new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'USD', notation: 'compact', compactDisplay: 'short',
  maximumFractionDigits: 2, minimumFractionDigits: 0, useGrouping: false,
});
const priceFormatter = new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  minimumFractionDigits: 0, useGrouping: true,
});
const regularAmountFormatter = new Intl.NumberFormat(locale, {
  maximumFractionDigits: 2, minimumFractionDigits: 0, useGrouping: false,
});

export function formatAmount(value: unknown): string {
  return amountFormatter.format(normalizeNumeric(value));
}

export function formatUsd(value: unknown): string {
  return usdFormatter.format(normalizeNumeric(value));
}

export function formatPrice(value: unknown): string {
  return priceFormatter.format(normalizeNumeric(value));
}

export function formatRegular(value: unknown): string {
  return regularAmountFormatter.format(normalizeNumeric(value));
}

export function formatInteger(value: unknown): string {
  const normalized = normalizeNumeric(value);
  if (typeof normalized === 'bigint') return normalized.toLocaleString(locale);
  return Number.isFinite(normalized)
    ? Math.trunc(normalized).toLocaleString(locale, { useGrouping: true, maximumFractionDigits: 0 })
    : '0';
}
