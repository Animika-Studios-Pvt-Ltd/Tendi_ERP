const LOCALE = 'en-IN';
const CURRENCY = 'INR';

const currencyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat(LOCALE);
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatCurrency = (value) => (value == null ? '—' : currencyFormatter.format(value));

/** Indian short scale: 12,50,000 -> ₹12.5 L, 4,20,00,000 -> ₹4.2 Cr */
export function formatCurrencyCompact(value) {
  if (value == null) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} L`;
  return formatCurrency(value);
}

export const formatNumber = (value) => (value == null ? '—' : numberFormatter.format(value));

export const formatPercent = (value, digits = 0) => (value == null ? '—' : `${Number(value).toFixed(digits)}%`);

export const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : '—');

export const formatDateTime = (value) => (value ? dateTimeFormatter.format(new Date(value)) : '—');

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function trim(number) {
  return Number(number.toFixed(number >= 100 ? 0 : 1)).toString();
}
