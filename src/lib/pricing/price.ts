import type { Dataset } from '../data/dataset';
import { tariffsFor } from '../data/dataset';
import { documentCategories, type Service, type Shipment, type Tariff } from '../data/schemas';
import { msg, type Msg } from '../msg';
import { toEur, rateIsStale } from './currency';
import { sortedDims, weightInfo, hasDims } from './weight';

export type PriceStatus = 'priced' | 'quote_required' | 'no_fit' | 'no_tariff';

export interface PriceResult {
  status: PriceStatus;
  serviceId: string;
  routeId: string;
  tariffId: string | null;
  tariffStatus: Tariff['status'] | null;
  channel: string | null;
  /** True only when the tariff itself is verified against a primary source. */
  verified: boolean;
  currency: string | null;
  nativeAmount: number | null;
  eur: number | null;
  packageName: string | null;
  billableKg: number | null;
  dimUsed: boolean;
  addOnNative: number;
  reason: Msg | null;
  warnings: Msg[];
}

const EPS = 1e-9;
export const isDocCategory = (c: string) => documentCategories.includes(c);
export const isVerifiedStatus = (s: string | null) => s === 'verified_published' || s === 'verified_live';

function applicable(t: Tariff, s: Shipment): boolean {
  if (t.appliesTo === 'all') return true;
  return t.appliesTo === 'documents' ? isDocCategory(s.category) : !isDocCategory(s.category);
}

function fits(pkgDims: [number, number, number], sd: [number, number, number]) {
  const p = [...pkgDims].sort((a, b) => b - a);
  return sd.every((d, i) => d <= p[i] + EPS);
}

interface Raw { status: PriceStatus; amount?: number; packageName?: string; reason?: Msg; warnings: Msg[]; billable?: number; dimUsed?: boolean }

function priceOne(t: Tariff, s: Shipment, svc: Service): Raw {
  const w = weightInfo(s, svc);
  const warnings: Msg[] = [];
  if (w.dimsMissingForDivisor) warnings.push(msg('price.dims_missing_dimweight'));
  switch (t.type) {
    case 'quote_only':
      return { status: 'quote_required', reason: msg('price.quote_only'), warnings };
    case 'sample_points': {
      const p = t.points.find((x) => Math.abs(x.kg - w.billablePerPackageKg) < EPS);
      if (!p) return { status: 'quote_required', reason: msg('price.sample_point_only', { kg: t.points.map((x) => x.kg).join(', ') }), warnings };
      return { status: 'priced', amount: p.price * s.packages, billable: w.billablePerPackageKg, dimUsed: w.dimUsed, warnings: [...warnings, msg('price.single_point')] };
    }
    case 'weight_brackets': {
      const kg = w.billablePerPackageKg;
      const b = t.brackets.find((x) => kg > x.minKg + EPS && kg <= x.maxKg + EPS);
      if (!b) {
        const max = Math.max(...t.brackets.map((x) => x.maxKg));
        return kg > max + EPS
          ? { status: 'no_fit', reason: msg('price.over_max_weight', { kg: round(kg), max }), warnings, billable: kg }
          : { status: 'quote_required', reason: msg('price.no_bracket', { kg: round(kg) }), warnings, billable: kg };
      }
      return { status: 'priced', amount: b.price * s.packages, billable: kg, dimUsed: w.dimUsed, warnings };
    }
    case 'fixed_packages': {
      const sd = sortedDims(s);
      const docs = isDocCategory(s.category);
      const cands = t.packages.filter((p) => {
        if (p.docsOnly && !docs) return false;
        if (w.actualPerPackageKg > p.maxKg + EPS) return false;
        if (sd && p.dimsCm && !fits(p.dimsCm, sd)) return false;
        if (sd && p.sumCm && sd[0] + sd[2] > p.sumCm + EPS) return false;
        return true;
      });
      if (!cands.length) return { status: 'no_fit', reason: msg(sd ? 'price.no_package_fits_dims' : 'price.no_package_fits_weight'), warnings };
      if (!sd) warnings.push(msg('price.fit_unchecked'));
      const best = cands.reduce((a, b) => (b.price < a.price ? b : a));
      return { status: 'priced', amount: best.price * s.packages, packageName: best.name, billable: w.actualPerPackageKg, dimUsed: false, warnings };
    }
  }
}
const round = (n: number) => Math.round(n * 1000) / 1000;

export function priceShipment(s: Shipment, svc: Service, ds: Dataset, today: string): PriceResult {
  const routeId = `${s.originCountry}-${s.destinationCountry}`;
  const base: PriceResult = {
    status: 'no_tariff', serviceId: svc.id, routeId, tariffId: null, tariffStatus: null, channel: null, verified: false, currency: null,
    nativeAmount: null, eur: null, packageName: null, billableKg: null, dimUsed: false, addOnNative: 0, reason: msg('price.no_tariff'), warnings: [],
  };
  const all = tariffsFor(ds, svc.id, routeId);
  if (!all.length) return base;
  const app = all.filter((t) => applicable(t, s));
  if (!app.length) return { ...base, tariffId: all[0].id, tariffStatus: all[0].status, currency: all[0].currency, status: 'quote_required', reason: msg('price.no_applicable_tariff') };

  const results = app.map((t) => ({ t, r: priceOne(t, s, svc) }));
  const pricedOnes = results.filter((x) => x.r.status === 'priced');
  // several channels (counter / online submission): the cheapest priced one wins, the channel is reported
  const pick = (pricedOnes.length ? pricedOnes.reduce((a, b) => ((b.r.amount ?? Infinity) * 1 < (a.r.amount ?? Infinity) ? b : a)) : undefined) ?? results.find((x) => x.r.status === 'no_fit') ?? results[0];
  const { t, r } = pick;
  const warnings = [...r.warnings];
  if (s.weightProvisional) warnings.push(msg('price.weight_provisional'));
  if (s.dimsProvisional) warnings.push(msg('price.dims_provisional'));
  if (t.status === 'research_estimate') warnings.push(msg('price.unverified_estimate'));
  if (t.vatMode === 'unknown') warnings.push(msg('price.vat_unknown'));
  if (t.fuelSurcharge === 'unknown') warnings.push(msg('price.fuel_unknown'));
  if (t.vatMode === 'excluded') warnings.push(msg('price.vat_excluded'));
  if (t.fuelSurcharge === 'excluded') warnings.push(msg('price.fuel_excluded'));
  if (t.conflicts.length) warnings.push(msg('price.has_conflict'));

  const out: PriceResult = {
    ...base,
    status: r.status,
    tariffId: t.id,
    tariffStatus: t.status,
    channel: t.channel,
    verified: isVerifiedStatus(t.status),
    currency: t.currency,
    packageName: r.packageName ?? null,
    billableKg: r.billable ?? null,
    dimUsed: r.dimUsed ?? false,
    reason: r.reason ?? null,
    warnings,
  };
  if (r.status !== 'priced' || r.amount === undefined) return out;

  let native = r.amount;
  if (s.insuranceDesired) {
    const ins = t.optionalCharges.filter((c) => c.kind === 'insurance' && c.currency === t.currency);
    if (ins.length) {
      if (s.declaredValueEur == null) out.warnings.push(msg('price.insurance_value_missing'));
      else {
        const c = ins.filter((x) => (x.coverEur ?? 0) >= s.declaredValueEur!).sort((a, b) => (a.coverEur ?? 0) - (b.coverEur ?? 0))[0];
        if (c) { native += c.amount; out.addOnNative = c.amount; out.warnings.push(msg('price.insurance_added', { cover: c.coverEur ?? 0 })); }
        else out.warnings.push(msg('price.insurance_cover_exceeded'));
      }
    }
  }
  out.nativeAmount = native;
  const eur = toEur(native, t.currency, ds.rates);
  out.eur = eur;
  if (eur === null) out.warnings.push(msg('price.rate_missing', { currency: t.currency }));
  else if (t.currency !== 'EUR' && rateIsStale(ds.rates, today)) out.warnings.push(msg('price.rate_stale'));
  void hasDims;
  return out;
}
