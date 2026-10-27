import { useMemo } from 'react';
import { useRemembered } from '../lib/persistence/remember';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import type { Shipment } from '../lib/data/schemas';
import { recommend, type Candidate, type Pick } from '../lib/recommendations/recommend';
import { Money, MsgList, StatusBadge } from './common';
import { RecCharts } from './RecCharts';
import { LimitsLine } from './LimitsLine';

type SortKey = 'name' | 'price' | 'status' | 'transit' | 'features' | 'value';
const STATUS_RANK: Record<string, number> = { verified_live: 0, verified_published: 1, historical: 2, research_estimate: 3, unverified_lead: 4 };
/** Real values, not text: EUR amount, mid-point days, status trust rank, feature count. Unknowns sort last in either direction. */
const sortVal = (c: Candidate, k: SortKey): number | string | null => {
  switch (k) {
    case 'name': return c.service.name.toLocaleLowerCase();
    case 'price': return c.price.eur;
    case 'status': return STATUS_RANK[c.price.tariffStatus ?? ''] ?? 5;
    case 'transit': return c.transit ? mid(c) : null;
    case 'features': return c.features;
    case 'value': return c.valueScore;
  }
};
const mid = (c: Candidate) => (c.transit ? (c.transit.minDays + c.transit.maxDays) / 2 : Infinity);
const daysTxt = (c: Candidate) => (c.transit ? (c.transit.minDays === c.transit.maxDays ? `${c.transit.minDays}` : `${c.transit.minDays}–${c.transit.maxDays}`) : '?');

function Timeline({ list }: { list: Candidate[] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...list.map((c) => c.transit?.maxDays ?? 0));
  return (
    <div className="chartbox timeline">
      <h3 className="sech">{t('rec.timeline')}</h3>
      <div className="tl" role="list" aria-label={t('rec.timeline')}>
      {list.map((c) => {
        const tr = c.transit;
        return (
          <div className="tlrow" role="listitem" key={c.service.id}>
            <div className="tn"><strong>{c.service.name}</strong><div className="small muted">{c.provider?.name}</div></div>
            <div className="tltrack" aria-hidden="true">{tr && <div className={`tlbar${tr.status === 'research_estimate' ? ' est' : ''}`} style={{ left: `${((tr.minDays - 0) / max) * 100}%`, width: `${Math.max(((tr.maxDays - tr.minDays) / max) * 100, 2)}%` }} />}</div>
            <div className="tlval"><strong>{tr ? t('transit.days', { d: daysTxt(c) }) : t('transit.unknown')}</strong><div className="small muted"><Money amount={c.price.nativeAmount} currency={c.price.currency} /></div></div>
          </div>
        );
      })}
      <div className="small muted">{t('rec.timeline_axis', { n: max })}</div>
      </div>
    </div>
  );
}

const PICKS: Pick[] = ['cheapest', 'fastest', 'bestValue', 'bestDocuments', 'bestTrackedInsured'];

function transitText(c: Candidate, t: ReturnType<typeof useI18n>['t']) {
  if (!c.transit) return t('transit.unknown');
  const d = c.transit.minDays === c.transit.maxDays ? `${c.transit.minDays}` : `${c.transit.minDays}–${c.transit.maxDays}`;
  return `${t('transit.days', { d })}${c.transit.status === 'research_estimate' ? ' ' + t('transit.estimate') : ''}`;
}

export function Recommendations({ shipment, selectedId, onSelect }: { shipment: Shipment; selectedId?: string | null; onSelect?: (serviceId: string) => void }) {
  const { t } = useI18n();
  const { ds, prefs, today } = useApp();
  const rec = useMemo(() => recommend(shipment, ds, prefs.rankWeights, today), [shipment, ds, prefs.rankWeights, today]);
  // Default order follows the shipment's priority; clicking a column header overrides it.
  const byPriority: { key: SortKey; dir: 1 | -1 } = shipment.budgetPreference === 'fastest' ? { key: 'transit', dir: 1 } : shipment.budgetPreference === 'balanced' ? { key: 'value', dir: -1 } : { key: 'price', dir: 1 };
  const [sort, setSort] = useRemembered<{ key: SortKey; dir: 1 | -1 } | null>(`sort.${onSelect ? 'plan' : 'compare'}`, () => null, (r) => {
    const o = r as { key?: string; dir?: number } | null;
    return o && ['name', 'price', 'status', 'transit', 'features', 'value'].includes(o.key ?? '') && (o.dir === 1 || o.dir === -1) ? { key: o.key as SortKey, dir: o.dir } : null;
  });
  const cur = sort ?? byPriority;
  const shown = useMemo(() => [...rec.ranked].sort((a, b) => {
    const x = sortVal(a, cur.key), y = sortVal(b, cur.key);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const d = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
    return d * cur.dir || (a.price.eur ?? 0) - (b.price.eur ?? 0);
  }), [rec.ranked, cur.key, cur.dir]);
  const th = (k: SortKey, label: string, first: 1 | -1 = 1) => (
    <th aria-sort={cur.key === k ? (cur.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sorth" onClick={() => setSort(cur.key === k ? { key: k, dir: (cur.dir * -1) as 1 | -1 } : { key: k, dir: first })}>{label}<span aria-hidden="true">{cur.key === k ? (cur.dir === 1 ? ' ▲' : ' ▼') : ' ↕'}</span></button>
    </th>
  );
  const routeId = ds.routes.find((r) => r.origin === shipment.originCountry && r.destination === shipment.destinationCountry)?.id ?? '';
  const row = (c: Candidate) => (
    <tr key={c.service.id} className={selectedId === c.service.id ? 'selected' : ''}>
      <td data-label=""><strong>{c.service.name}</strong><div className="muted small">{c.provider?.name}</div>
        {c.service.accessKey && <details className="access"><summary>{t('rec.access')}</summary><p>{t(c.service.accessKey)}</p></details>}</td>
      <td className="small" data-label={t('rec.limits')}><LimitsLine svc={c.service} routeId={routeId} /></td>
      <td data-label={t('rec.price')}><span><Money amount={c.price.nativeAmount} currency={c.price.currency} />{c.price.packageName && <div className="small muted">{c.price.packageName}</div>}{c.price.channel && c.price.channel !== 'unknown' && <div className="small muted">{t(`channel.${c.price.channel}`)}</div>}</span></td>
      <td data-label={t('rec.status')}><StatusBadge status={c.price.tariffStatus} /></td>
      <td className="small" data-label={t('rec.transit')}>{transitText(c, t)}</td>
      <td className="small" data-label={t('rec.features')}>{c.features}/4</td>
      <td className="small" data-label={t('rec.notes')}><MsgList items={[...c.price.warnings, ...c.eligibility.warnings]} kind="warn" /></td>
      {onSelect && <td data-label=""><button onClick={() => onSelect(c.service.id)} disabled={selectedId === c.service.id}>{selectedId === c.service.id ? t('rec.selected') : t('rec.select')}</button></td>}
    </tr>
  );
  return (
    <div className="recs">
      <div className="picks">
        {PICKS.map((p) => {
          const c = rec.top[p];
          return (
            <div className="pick" key={p}>
              <div className="small muted pk-label">{t(`pick.${p}`)}</div>
              {c ? (<><strong className="pk-name">{c.service.name}</strong><div className="pk-price"><Money amount={c.price.nativeAmount} currency={c.price.currency} /></div><div className="small pk-time">⏱ {transitText(c, t)}</div><div className="pk-badge"><StatusBadge status={c.price.tariffStatus} /></div></>) : <span className="muted">{t('pick.none')}</span>}
            </div>
          );
        })}
      </div>
      {rec.ranked.length > 1 && (
        <div className="viz">
          <Timeline list={shown} />
          <RecCharts shipment={shipment} ranked={rec.ranked} selectedId={selectedId} onSelect={onSelect} />
        </div>
      )}
      {rec.ranked.length > 0 && (<div className="chartbox"><h3 className="sech">{t('rec.all_options')}</h3><p className="small muted">{t('rec.sort_hint')} {t('rec.features_note')}</p>
        <div className="scroll"><table className="tbl stack recstbl"><thead><tr>{th('name', t('rec.service'))}<th>{t('rec.limits')}</th>{th('price', t('rec.price'))}{th('status', t('rec.status'))}{th('transit', t('rec.transit'))}{th('features', t('rec.features'), -1)}<th>{t('rec.notes')}</th>{onSelect && <th />}</tr></thead><tbody>{shown.map(row)}</tbody></table></div></div>
      )}
      {rec.needsQuote.length > 0 && (
        <details open={rec.ranked.length === 0}><summary>{t('rec.needs_quote', { n: rec.needsQuote.length })}</summary>
          <table className="tbl stack"><tbody>{rec.needsQuote.map((c) => (
            <tr key={c.service.id}><td data-label=""><strong>{c.service.name}</strong></td><td className="small" data-label="">{c.price.reason ? t(c.price.reason.key, c.price.reason.params) : ''}</td><td data-label={t('rec.status')}><StatusBadge status={c.price.tariffStatus} /></td>
              <td data-label="">{c.service.bookingUrl && <a href={c.service.bookingUrl} target="_blank" rel="noreferrer">{t('rec.open_quote')}</a>}</td>
              <td className="small" data-label=""><MsgList items={c.eligibility.warnings} kind="warn" /></td>
              {onSelect && <td data-label=""><button onClick={() => onSelect(c.service.id)}>{t('rec.select')}</button></td>}</tr>))}</tbody></table>
        </details>
      )}
      {rec.ineligible.length > 0 && (
        <details><summary>{t('rec.ineligible', { n: rec.ineligible.length })}</summary>
          <ul className="msgs">{rec.ineligible.map(({ candidate, reasons }) => <li key={candidate.service.id}><strong>{candidate.service.name}</strong>: {reasons.map((r) => t(r.key, r.params)).join(' · ')}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
