import type { Dataset } from '../data/dataset';
import { AUTHORITY_RANK, type Tariff } from '../data/schemas';
import { rateAgeDays, RATE_STALE_DAYS } from '../pricing/currency';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue { severity: Severity; code: string; message: string; ref?: string }

export const STALE_VERIFICATION_DAYS = 90;
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'KRW', 'TWD', 'JPY', 'AUD', 'CAD', 'BRL', 'CNY'];

/** Deterministic FNV-1a hash of the price-relevant payload of a tariff (used for "unexpected change" detection). */
export function tariffHash(t: Tariff): string {
  const payload = JSON.stringify([t.currency, t.type, t.type === 'weight_brackets' ? t.brackets : t.type === 'fixed_packages' ? t.packages : t.type === 'sample_points' ? t.points : null, t.optionalCharges]);
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const buildSnapshot = (ds: Dataset) => Object.fromEntries(ds.tariffs.map((t) => [t.id, tariffHash(t)]));

const daysBetween = (a: string, b: string) => Math.floor((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

export function checkTariffs(ds: Dataset, today: string, snapshot?: Record<string, string>): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Severity, code: string, message: string, ref?: string) => out.push({ severity, code, message, ref });
  const sourceIds = new Set(ds.sources.map((s) => s.id));
  const serviceIds = new Set(ds.services.map((s) => s.id));
  const routeIds = new Set(ds.routes.map((r) => r.id));

  const seen = new Set<string>();
  for (const t of ds.tariffs) {
    if (seen.has(t.id)) add('error', 'duplicate_tariff_id', `Duplicate tariff id ${t.id}`, t.id);
    seen.add(t.id);
    if (!serviceIds.has(t.serviceId)) add('error', 'unknown_service', `Tariff references unknown service ${t.serviceId}`, t.id);
    if (!routeIds.has(t.routeId)) add('error', 'unknown_route', `Tariff references unknown route ${t.routeId}`, t.id);
    const svc = ds.services.find((s) => s.id === t.serviceId);
    if (svc && !svc.routes.includes(t.routeId) && !svc.unavailableRoutes[t.routeId]) add('error', 'route_not_in_service', `Service ${t.serviceId} does not list route ${t.routeId}`, t.id);
    if (!t.id.startsWith(`${t.serviceId}:${t.routeId}`)) add('warning', 'id_pattern', `Tariff id does not follow serviceId:routeId`, t.id);
    if (!CURRENCIES.includes(t.currency)) add('error', 'currency_unsupported', `Unsupported currency ${t.currency}`, t.id);
    else if (t.currency !== 'EUR' && !ds.rates.rates[t.currency]) add('warning', 'rate_missing', `No exchange rate for ${t.currency}; EUR totals unavailable`, t.id);
    for (const sid of t.sourceIds) if (!sourceIds.has(sid)) add('error', 'unknown_source', `Unknown source ${sid}`, t.id);
    if (!t.sourceIds.length) add('error', 'no_source', 'Tariff has no source', t.id);

    const verified = t.status === 'verified_published' || t.status === 'verified_live';
    const primary = t.primarySourceId ? ds.sources.find((x) => x.id === t.primarySourceId) : undefined;
    if (t.primarySourceId && !primary) add('error', 'unknown_primary_source', `Unknown primary source ${t.primarySourceId}`, t.id);
    if (primary && !t.sourceIds.includes(primary.id)) add('error', 'primary_not_in_sources', 'Primary source is not listed in sourceIds', t.id);
    if (primary) {
      const better = t.sourceIds.map((id) => ds.sources.find((x) => x.id === id)).filter((x) => x && AUTHORITY_RANK[x.authority] < AUTHORITY_RANK[primary.authority]);
      if (better.length) add('warning', 'primary_not_best_source', `A higher-authority source is cited: ${better.map((x) => x!.id).join(', ')}`, t.id);
    }
    if (verified && !primary) add('error', 'verified_without_primary', 'Verified tariff has no primarySourceId', t.id);
    if (verified && primary && AUTHORITY_RANK[primary.authority] > AUTHORITY_RANK.carrier_calculator) add('error', 'verified_weak_primary', 'Verified tariff relies on a secondary or seed source as its source of truth', t.id);
    if (!verified && t.type !== 'quote_only' && !primary) add('info', 'no_primary_source', 'No source of truth chosen yet (seed estimate)', t.id);
    if (verified) {
      if (!t.lastVerified) add('error', 'verified_without_date', 'Verified tariff has no lastVerified date', t.id);
      if (!t.sourceIds.some((id) => { const s = ds.sources.find((x) => x.id === id); return s && s.kind !== 'user_seed' && s.kind !== 'secondary'; }))
        add('error', 'verified_without_primary_source', 'Verified tariff cites no primary source', t.id);
      if (t.vatMode === 'unknown' || t.fuelSurcharge === 'unknown') add('warning', 'verified_vat_fuel_unknown', 'Verified tariff but VAT/fuel treatment unknown', t.id);
      if (t.lastVerified && daysBetween(t.lastVerified, today) > STALE_VERIFICATION_DAYS) add('warning', 'stale_verification', `Last verified ${t.lastVerified} (> ${STALE_VERIFICATION_DAYS} days)`, t.id);
    } else if (t.status === 'research_estimate') {
      add('info', 'never_verified', 'Seed price, not verified against a primary source', t.id);
    }
    if (t.conflicts.length) add('warning', 'source_conflict', `Open conflict: ${t.conflicts.join(', ')}`, t.id);
    if (t.vatMode === 'unknown' && t.type !== 'quote_only') add('info', 'vat_unknown', 'VAT treatment unknown', t.id);
    if (t.fuelSurcharge === 'unknown' && t.type !== 'quote_only') add('info', 'fuel_unknown', 'Fuel surcharge treatment unknown', t.id);

    if (t.type === 'weight_brackets') {
      const b = [...t.brackets].sort((x, y) => x.minKg - y.minKg);
      if (b[0].minKg > 0) add('warning', 'bracket_start_gap', `Weights up to ${b[0].minKg} kg are not covered (quote required)`, t.id);
      for (let i = 0; i < b.length; i++) {
        if (b[i].maxKg <= b[i].minKg) add('error', 'bracket_invalid', `Bracket ${i} has max <= min`, t.id);
        if (i > 0) {
          if (b[i].minKg < b[i - 1].maxKg - 1e-9) add('error', 'bracket_overlap', `Brackets overlap at ${b[i].minKg} kg`, t.id);
          else if (b[i].minKg > b[i - 1].maxKg + 1e-9) add('warning', 'bracket_gap', `Gap between ${b[i - 1].maxKg} and ${b[i].minKg} kg (quote required)`, t.id);
          if (b[i].price < b[i - 1].price) add('warning', 'price_not_monotonic', `Price decreases at ${b[i].minKg} kg`, t.id);
        }
      }
      if (svc && Math.max(...b.map((x) => x.maxKg)) > svc.maxKg + 1e-9) add('warning', 'bracket_beyond_service_max', 'Bracket exceeds service max weight', t.id);
    }
    if (t.type === 'fixed_packages') {
      const p = [...t.packages].sort((x, y) => x.maxKg - y.maxKg);
      for (const x of t.packages) {
        if (x.dimsCm && x.dimsCm.some((d) => d <= 0)) add('error', 'package_dims_invalid', `Package ${x.id} has non-positive dimension`, t.id);
        if (x.maxKg <= 0 || x.price < 0) add('error', 'package_invalid', `Package ${x.id} invalid`, t.id);
      }
      for (let i = 1; i < p.length; i++) if (p[i].price < p[i - 1].price) add('warning', 'price_not_monotonic', `Package ${p[i].id} cheaper than smaller ${p[i - 1].id}`, t.id);
      if (new Set(t.packages.map((x) => x.id)).size !== t.packages.length) add('error', 'duplicate_package', 'Duplicate package id', t.id);
    }
    const snap = snapshot?.[t.id];
    if (snapshot && snap === undefined) add('info', 'not_in_snapshot', 'Tariff not in snapshot', t.id);
    else if (snap !== undefined && snap !== tariffHash(t)) add('warning', 'unexpected_change', 'Price data changed since the last snapshot. Re-verify, then update the snapshot', t.id);
  }
  // duplicate service+route+appliesTo+type
  const keys = new Map<string, string>();
  for (const t of ds.tariffs) {
    const k = `${t.serviceId}|${t.routeId}|${t.appliesTo}|${t.type}|${t.channel}`;
    if (keys.has(k) && t.type !== 'sample_points') add('warning', 'duplicate_tariff', `Same service/route/type as ${keys.get(k)}`, t.id);
    keys.set(k, t.id);
  }
  // Paired countries (neighbours that may share a price today) must keep independent tariff records
  for (const [A, B] of ds.config.pairedCountries) {
    for (const svc of ds.services) {
      const ta = ds.tariffs.filter((t) => t.serviceId === svc.id && t.routeId.endsWith(`-${A}`));
      const tb = ds.tariffs.filter((t) => t.serviceId === svc.id && t.routeId.endsWith(`-${B}`));
      if (ta.length !== tb.length && svc.routes.some((r) => r.endsWith(`-${A}`)) && svc.routes.some((r) => r.endsWith(`-${B}`)))
        add('warning', 'paired_asymmetric', `${A} and ${B} tariff records differ in count for ${svc.id}`, svc.id);
      for (const k of ta) {
        const mate = tb.find((t) => t.routeId.replace(B, A) === k.routeId && t.appliesTo === k.appliesTo && t.type === k.type && t.channel === k.channel);
        if (mate && mate.id === k.id) add('error', 'paired_shared_record', `${A} and ${B} share one tariff record`, k.id);
        if (mate && tariffHash(mate) === tariffHash(k) && k.status === 'research_estimate')
          add('info', 'paired_identical_seed', `${A} and ${B} prices are identical in the seed. Not confirmed to be equal; verify separately`, `${k.id} / ${mate.id}`);
      }
    }
  }
  return out;
}

export function checkDataset(ds: Dataset, today: string, snapshot?: Record<string, string>): Issue[] {
  const out = checkTariffs(ds, today, snapshot);
  const add = (severity: Severity, code: string, message: string, ref?: string) => out.push({ severity, code, message, ref });
  const age = rateAgeDays(ds.rates, today);
  if (age > RATE_STALE_DAYS) add('warning', 'rates_stale', `Exchange rates are ${age} days old (limit ${RATE_STALE_DAYS})`, 'exchange-rates');
  if (age < 0) add('error', 'rates_future', 'Exchange rate date is in the future', 'exchange-rates');

  const ids = new Set<string>();
  for (const s of ds.services) {
    if (ids.has(s.id)) add('error', 'duplicate_service_id', `Duplicate service id ${s.id}`, s.id);
    ids.add(s.id);
    if (!ds.providers.some((p) => p.id === s.providerId)) add('error', 'unknown_provider', `Unknown provider ${s.providerId}`, s.id);
    if (s.dimDivisor !== null && (s.dimDivisor < 3000 || s.dimDivisor > 7000)) add('warning', 'divisor_suspicious', `Dimensional divisor ${s.dimDivisor} is unusual`, s.id);
    if (s.availability === 'bookable') for (const r of s.routes) if (!ds.tariffs.some((t) => t.serviceId === s.id && t.routeId === r)) add('warning', 'no_tariff', `Bookable service has no tariff for ${r}`, s.id);
    if (s.maxKg <= 0) add('error', 'service_maxkg_invalid', 'maxKg must be positive', s.id);
  }
  for (const r of ds.config.requiredRoutes) if (!ds.routes.some((x) => x.id === r)) add('error', 'missing_route', `Required route ${r} is missing`, r);
  for (const r of ds.routes) if (r.origin === r.destination) add('error', 'route_same_country', 'Origin equals destination', r.id);
  for (const t of ds.transit) {
    if (t.minDays > t.maxDays) add('error', 'transit_range', 'Transit min > max', `${t.serviceId}:${t.routeId}`);
    if (!ds.services.some((s) => s.id === t.serviceId)) add('error', 'transit_unknown_service', 'Transit references unknown service', t.serviceId);
    if (t.status !== 'verified_published' && t.status !== 'verified_live') add('info', 'transit_unverified', 'Transit time is an estimate', `${t.serviceId}:${t.routeId}`);
  }
  for (const r of ds.restrictions) {
    for (const sid of r.appliesTo) if (!ds.services.some((s) => s.id === sid)) add('error', 'restriction_unknown_service', `Restriction ${r.id} references ${sid}`, r.id);
    if (r.status === 'eligibility_not_confirmed') add('info', 'restriction_unconfirmed', 'Eligibility / collection rule not confirmed', r.id);
  }
  for (const s of ds.sources) if (!s.accessedAt) add('info', 'source_not_accessed', 'Source never accessed', s.id);
  return out;
}

export function summarize(issues: Issue[]) {
  return { errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length };
}

/** Self-test case for the first configured country pair that has two comparable tariff records. */
function pairedTests(ds: Dataset): [string, (d: Dataset) => void, string][] {
  for (const [A, B] of ds.config.pairedCountries) {
    for (const t of ds.tariffs) {
      if (!t.routeId.endsWith(`-${A}`)) continue;
      const mate = ds.tariffs.find((x) => x.serviceId === t.serviceId && x.routeId === t.routeId.replace(`-${A}`, `-${B}`));
      if (!mate) continue;
      return [[`detects shared ${A}/${B} record`, (d) => { const x = d.tariffs.find((y) => y.id === t.id)!; const y = d.tariffs.find((z) => z.id === mate.id)!; y.id = x.id; }, 'paired_shared_record']];
    }
  }
  return [];
}

/** Fault-injection self-test: proves the checker actually detects the faults it claims to. */
export function selfTest(ds: Dataset, today: string): { name: string; pass: boolean }[] {
  const clone = (): Dataset => structuredClone(ds);
  const has = (d: Dataset, code: string) => checkDataset(d, today).some((i) => i.code === code);
  const tests: [string, (d: Dataset) => void, string][] = [
    ['detects bracket overlap', (d) => { const t = d.tariffs.find((x) => x.type === 'weight_brackets' && x.brackets.length > 2)!; if (t.type === 'weight_brackets') t.brackets[1].minKg = t.brackets[0].maxKg - 0.01; }, 'bracket_overlap'],
    ['detects bracket gap', (d) => { const t = d.tariffs.find((x) => x.type === 'weight_brackets' && x.brackets.length > 2)!; if (t.type === 'weight_brackets') t.brackets[1].minKg = t.brackets[0].maxKg + 0.5; }, 'bracket_gap'],
    ['detects unknown source', (d) => { d.tariffs[0].sourceIds.push('nope'); }, 'unknown_source'],
    ['detects unsupported currency', (d) => { d.tariffs[0].currency = 'XXX'; }, 'currency_unsupported'],
    ['detects verified without date', (d) => { const t = d.tariffs.find((x) => x.status === 'verified_published')!; t.lastVerified = null; }, 'verified_without_date'],
    ['detects stale rates', (d) => { d.rates.rateDate = '2020-01-01'; }, 'rates_stale'],
    ...pairedTests(ds),
    ['detects duplicate tariff id', (d) => { d.tariffs[1].id = d.tariffs[0].id; }, 'duplicate_tariff_id'],
    ['detects unexpected price change', () => undefined, 'unexpected_change'],
  ];
  return tests.map(([name, mutate, code]) => {
    const d = clone();
    if (code === 'unexpected_change') {
      const snap = buildSnapshot(d);
      const t = d.tariffs.find((x) => x.type === 'weight_brackets')!;
      if (t.type === 'weight_brackets') t.brackets[0].price += 1;
      return { name, pass: checkDataset(d, today, snap).some((i) => i.code === code) };
    }
    mutate(d);
    return { name, pass: has(d, code) };
  });
}
