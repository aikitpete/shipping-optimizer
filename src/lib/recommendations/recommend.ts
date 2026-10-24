import type { Dataset } from '../data/dataset';
import { providerById, transitFor } from '../data/dataset';
import type { Provider, Service, Shipment, Transit } from '../data/schemas';
import { priceShipment, type PriceResult } from '../pricing/price';
import { checkEligibility, type Eligibility } from './eligibility';
import type { Msg } from '../msg';

export interface RankWeights { price: number; speed: number; features: number }
export const DEFAULT_WEIGHTS: RankWeights = { price: 0.5, speed: 0.3, features: 0.2 };

export interface Candidate {
  service: Service;
  provider: Provider | undefined;
  eligibility: Eligibility;
  price: PriceResult;
  transit: Transit | undefined;
  /** Count of documented (confirmed true) features: tracking, signature, insurance, irreplaceable. Not a reliability score. */
  features: number;
  valueScore: number | null;
}

export type Pick = 'cheapest' | 'fastest' | 'bestValue' | 'bestDocuments' | 'bestTrackedInsured';

export interface Recommendation {
  ranked: Candidate[];        // eligible + priced, sorted by EUR ascending
  needsQuote: Candidate[];    // eligible but no usable price
  ineligible: { candidate: Candidate; reasons: Msg[] }[];
  top: Record<Pick, Candidate | null>;
}

export const documentedFeatures = (s: Service) =>
  [s.tracking, s.signature, s.insurance, s.irreplaceable].filter((v) => v === true).length;
const avgDays = (t?: Transit) => (t ? (t.minDays + t.maxDays) / 2 : null);

export function recommend(s: Shipment, ds: Dataset, weights: RankWeights, today: string): Recommendation {
  const routeId = `${s.originCountry}-${s.destinationCountry}`;
  const cands: Candidate[] = ds.services
    .filter((svc) => svc.routes.includes(routeId) || svc.unavailableRoutes[routeId])
    .map((service) => ({
      service,
      provider: providerById(ds, service.providerId),
      eligibility: checkEligibility(s, service, ds),
      price: priceShipment(s, service, ds, today),
      transit: transitFor(ds, service.id, routeId),
      features: documentedFeatures(service),
      valueScore: null,
    }));

  const ineligible: Recommendation['ineligible'] = [];
  const ok: Candidate[] = [];
  for (const c of cands) {
    const reasons = [...c.eligibility.hard];
    if (c.price.status === 'no_fit' && c.price.reason) reasons.push(c.price.reason);
    if (reasons.length) ineligible.push({ candidate: c, reasons });
    else ok.push(c);
  }
  const ranked = ok.filter((c) => c.price.status === 'priced' && c.price.eur !== null).sort((a, b) => a.price.eur! - b.price.eur!);
  const needsQuote = ok.filter((c) => !ranked.includes(c));

  if (ranked.length) {
    const minEur = Math.min(...ranked.map((c) => c.price.eur!));
    const days = ranked.map((c) => avgDays(c.transit)).filter((d): d is number => d !== null);
    const minDays = days.length ? Math.min(...days) : null;
    const tw = weights.price + weights.speed + weights.features || 1;
    for (const c of ranked) {
      const p = c.price.eur! > 0 ? minEur / c.price.eur! : 1;
      const d = avgDays(c.transit);
      const sp = d !== null && minDays !== null ? (d > 0 ? minDays / d : 1) : 0.5;
      const bonus = s.preferredProviderId && c.service.providerId === s.preferredProviderId ? 0.03 : 0;
      c.valueScore = (weights.price * p + weights.speed * sp + weights.features * (c.features / 4)) / tw + bonus;
    }
  }

  const by = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | null>((best, x) => (best === null || f(x) < f(best) ? x : best), null);
  const withTransit = ranked.filter((c) => c.transit);
  const docScore = (c: Candidate) => c.features + (c.service.docsOnly ? 0.5 : 0);
  const docPool = ranked.filter((c) => c.features > 0 || c.service.docsOnly);
  const top: Recommendation['top'] = {
    cheapest: ranked[0] ?? null,
    fastest: by(withTransit, (c) => avgDays(c.transit)! * 1000 + c.price.eur!),
    bestValue: by(ranked, (c) => -(c.valueScore ?? 0)),
    bestDocuments: by(docPool, (c) => -docScore(c) * 100000 + c.price.eur!),
    bestTrackedInsured: by(ranked.filter((c) => c.service.tracking === true && c.service.insurance === true), (c) => c.price.eur!),
  };
  return { ranked, needsQuote, ineligible, top };
}

/** The pick that matches the shipment's budget preference. */
export function primaryPick(s: Shipment, r: Recommendation): Candidate | null {
  if (s.budgetPreference === 'cheapest') return r.top.cheapest;
  if (s.budgetPreference === 'fastest') return r.top.fastest ?? r.top.cheapest;
  return r.top.bestValue;
}
