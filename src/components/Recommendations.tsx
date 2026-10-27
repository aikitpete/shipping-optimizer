import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import type { Shipment } from '../lib/data/schemas';
import { recommend, type Candidate, type Pick } from '../lib/recommendations/recommend';
import { Money, MsgList, StatusBadge } from './common';
import { RecCharts } from './RecCharts';
import { LimitsLine } from './LimitsLine';

type Sort = 'price' | 'time';
const mid = (c: Candidate) => (c.transit ? (c.transit.minDays + c.transit.maxDays) / 2 : Infinity);
const daysTxt = (c: Candidate) => (c.transit ? (c.transit.minDays === c.transit.maxDays ? `${c.transit.minDays}` : `${c.transit.minDays}–${c.transit.maxDays}`) : '?');

function Timeline({ list }: { list: Candidate[] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...list.map((c) => c.transit?.maxDays ?? 0));
  return (
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
  const [sort, setSort] = useState<Sort>('time');
  const shown = useMemo(() => (sort === 'time' ? [...rec.ranked].sort((a, b) => mid(a) - mid(b) || a.price.eur! - b.price.eur!) : rec.ranked), [rec.ranked, sort]);
  const routeId = ds.routes.find((r) => r.origin === shipment.originCountry && r.destination === shipment.destinationCountry)?.id ?? '';
  const row = (c: Candidate) => (
    <tr key={c.service.id} className={selectedId === c.service.id ? 'selected' : ''}>
      <td data-label=""><strong>{c.service.name}</strong><div className="muted small">{c.provider?.name}</div>
        <LimitsLine svc={c.service} routeId={routeId} />
        {c.service.accessKey && <details className="access"><summary>{t('rec.access')}</summary><p>{t(c.service.accessKey)}</p></details>}</td>
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
              <div className="small muted">{t(`pick.${p}`)}</div>
              {c ? (<><strong>{c.service.name}</strong><div><Money amount={c.price.nativeAmount} currency={c.price.currency} /></div><div className="small">⏱ {transitText(c, t)}</div><StatusBadge status={c.price.tariffStatus} /></>) : <span className="muted">{t('pick.none')}</span>}
            </div>
          );
        })}
      </div>
      {rec.ranked.length > 1 && (<>
        <div className="sortbar"><span className="small muted">{t('rec.sort')}</span>
          <div className="seg" role="radiogroup" aria-label={t('rec.sort')}>
            {(['time', 'price'] as const).map((k) => <button type="button" key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{t(`rec.sort_${k}`)}</button>)}
          </div></div>
        <h4>{t('rec.timeline')}</h4>
        <Timeline list={shown} />
      </>)}
      <p className="small muted">{t('rec.features_note')}</p>
      <RecCharts shipment={shipment} ranked={rec.ranked} selectedId={selectedId} onSelect={onSelect} />
      {rec.ranked.length > 0 && (
        <table className="tbl stack"><thead><tr><th>{t('rec.service')}</th><th>{t('rec.price')}</th><th>{t('rec.status')}</th><th>{t('rec.transit')}</th><th>{t('rec.features')}</th><th>{t('rec.notes')}</th>{onSelect && <th />}</tr></thead><tbody>{shown.map(row)}</tbody></table>
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
