import type { Rates } from '../data/schemas';
import { localeOf } from '../../i18n/languages';

/** Native currency amount is authoritative. EUR = native / rate (rate = units of currency per 1 EUR). Unrounded. */
export function toEur(amount: number, currency: string, rates: Rates): number | null {
  if (currency === 'EUR') return amount;
  const r = rates.rates[currency];
  if (!r || !(r > 0)) return null;
  return amount / r;
}

export function rateAgeDays(rates: Rates, today: string): number {
  const ms = Date.parse(today + 'T00:00:00Z') - Date.parse(rates.rateDate + 'T00:00:00Z');
  return Math.floor(ms / 86_400_000);
}
export const RATE_STALE_DAYS = 7;
export const rateIsStale = (rates: Rates, today: string) => rateAgeDays(rates, today) > RATE_STALE_DAYS;

export function fmtMoney(amount: number, currency: string, lang: string): string {
  const frac = currency === 'KRW' || currency === 'JPY' ? 0 : 2;
  return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(amount);
}
