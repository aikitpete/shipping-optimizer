import type { Dataset } from '../data/dataset';
import { isVerifiedStatus } from '../pricing/price';
import { checkDataset, summarize, type Issue } from './check';

export interface SourceProbe { sourceId: string; url: string; reachable: boolean | null; httpStatus: number | null; note: string }
export interface ReverifyReport {
  generatedAt: string;
  probes: SourceProbe[];
  /** Tariffs that still need a human to read the live/official price. Reverify never edits prices. */
  manualQueue: { tariffId: string; status: string; sourceUrls: string[] }[];
}

type Fetcher = (url: string, init?: { method?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/**
 * Checks whether sources are reachable. It does NOT read prices out of pages (interactive calculators cannot be
 * scraped reliably) and never modifies tariff data. Anything not machine-verifiable lands in the manual queue.
 */
export async function reverify(ds: Dataset, now: string, fetcher: Fetcher): Promise<ReverifyReport> {
  const probes: SourceProbe[] = [];
  for (const s of ds.sources.filter((x) => x.kind !== 'user_seed')) {
    if (!s.fetchable) { probes.push({ sourceId: s.id, url: s.url, reachable: null, httpStatus: null, note: 'interactive_or_blocked' }); continue; }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10_000);
      const r = await fetcher(s.url, { method: 'GET', signal: ctl.signal });
      clearTimeout(timer);
      probes.push({ sourceId: s.id, url: s.url, reachable: r.ok, httpStatus: r.status, note: r.ok ? 'reachable' : 'http_error' });
    } catch (e) {
      probes.push({ sourceId: s.id, url: s.url, reachable: false, httpStatus: null, note: e instanceof Error ? e.message.slice(0, 80) : 'error' });
    }
  }
  const manualQueue = ds.tariffs
    .filter((t) => !isVerifiedStatus(t.status) && t.type !== 'quote_only' || t.conflicts.length > 0)
    .map((t) => ({ tariffId: t.id, status: t.status, sourceUrls: t.sourceIds.map((id) => ds.sources.find((s) => s.id === id)?.url ?? id) }));
  return { generatedAt: now, probes, manualQueue };
}

export function buildAudit(ds: Dataset, today: string, snapshot?: Record<string, string>) {
  const issues: Issue[] = checkDataset(ds, today, snapshot);
  const byStatus: Record<string, number> = {};
  for (const t of ds.tariffs) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  return {
    kind: 'shipping-optimizer-audit',
    generatedAt: today,
    exchangeRates: ds.rates,
    summary: { tariffs: ds.tariffs.length, byStatus, issues: summarize(issues) },
    tariffs: ds.tariffs.map((t) => ({
      id: t.id, serviceId: t.serviceId, routeId: t.routeId, type: t.type, currency: t.currency, status: t.status, confidence: t.confidence,
      lastVerified: t.lastVerified, effectiveDate: t.effectiveDate, vatMode: t.vatMode, fuelSurcharge: t.fuelSurcharge, conflicts: t.conflicts,
      sources: t.sourceIds.map((id) => ds.sources.find((s) => s.id === id)).filter(Boolean),
    })),
    transit: ds.transit.map((t) => ({ ...t })),
    restrictions: ds.restrictions,
    issues,
  };
}
