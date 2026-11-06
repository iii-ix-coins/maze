function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function formatTokenAmount(rawAmount, decimals) {
  const value = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  const precision = Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
  if (precision === 0) {
    return value.toString();
  }
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(precision);
  const whole = absolute / base;
  const fraction = absolute % base;
  let fractionString = fraction.toString().padStart(precision, '0');
  fractionString = fractionString.replace(/0+$/, '');
  const formatted = fractionString.length > 0
    ? `${whole.toString()}.${fractionString}`
    : whole.toString();
  return negative ? `-${formatted}` : formatted;
}
function formatUtcSnapshotFilename(baseName, date = new Date()) {
  const safeBaseName = String(baseName || 'holders')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .trim() || 'holders';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date for snapshot filename.');
  }
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    day: 'numeric'
  }).format(d);
  const month = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long'
  }).format(d).toLowerCase();
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric'
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d).replace(':', '-');
  return `${safeBaseName}-${day} ${month} ${year}-${time}.json`;
}
module.exports = {
  sleep,
  formatTokenAmount,
  formatUtcSnapshotFilename
};