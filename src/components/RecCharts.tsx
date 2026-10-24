import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import type { Shipment } from '../lib/data/schemas';
import type { Candidate } from '../lib/recommendations/recommend';
import { priceShipment } from '../lib/pricing/price';
import { BarChart, LineChart, ScatterChart, eur0, type BarRow, type Dot, type LineSeries } from './charts';

type View = 'bars' | 'scatter' | 'curve';
const WEIGHTS = [0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30];

export function RecCharts({ shipment, ranked, selectedId, onSelect }: { shipment: Shipment; ranked: Candidate[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const { t } = useI18n();
  const { ds, today } = useApp();
  const [view, setView] = useState<View>('bars');
  const list = ranked.filter((c) => c.price.eur !== null);
  const top = list.slice(0, 4);
  const curves = useMemo<LineSeries[]>(() => {
    if (view !== 'curve') return [];
    const xs = [...new Set([...WEIGHTS.filter((w) => w <= 30), shipment.weightKg])].sort((a, b) => a - b);
    return top.map((c, i) => ({
      id: c.service.id, name: c.service.name, color: `var(--c${i + 1})`,
      pts: xs.map((x) => ({ x, y: priceShipment({ ...shipment, weightKg: x, packages: 1 }, c.service, ds, today).eur })),
    }));
  }, [view, top, shipment, ds, today]);
  if (list.length < 2) return null;
  const tip = (c: Candidate) => (
    <>
      <strong>{c.service.name}</strong><br />
      {eur0(c.price.eur!)} € · {c.transit ? t('transit.days', { d: c.transit.minDays === c.transit.maxDays ? `${c.transit.minDays}` : `${c.transit.minDays}–${c.transit.maxDays}` }) : t('transit.unknown')}<br />
      {c.price.verified ? t('chart.verified') : t('chart.estimate')}
    </>
  );
  const rows: BarRow[] = list.slice(0, 12).map((c) => ({
    id: c.service.id, label: c.service.name, sub: c.provider?.name, value: c.price.eur!, valueText: `${eur0(c.price.eur!)} €`,
    solid: c.price.verified, selected: selectedId === c.service.id, tip: tip(c),
    onClick: onSelect ? () => onSelect(c.service.id) : undefined,
  }));
  const dots: Dot[] = list.filter((c) => c.transit).map((c, i) => ({
    id: c.service.id, x: (c.transit!.minDays + c.transit!.maxDays) / 2, y: c.price.eur!, label: c.service.name,
    solid: c.price.verified, selected: selectedId === c.service.id, showLabel: i < 3, tip: tip(c),
    onClick: onSelect ? () => onSelect(c.service.id) : undefined,
  }));
  const legend = <p className="small muted chart-legend"><span className="lg solid" /> {t('chart.verified')} · <span className="lg est" /> {t('chart.estimate')}</p>;
  return (
    <div className="chartbox">
      <div className="viewtabs" role="tablist" aria-label={t('chart.view')}>
        {(['bars', 'scatter', 'curve'] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'primary' : ''} onClick={() => setView(v)}>{t(`chart.view_${v}`)}</button>
        ))}
      </div>
      {view === 'bars' && (<><BarChart rows={rows} ariaLabel={t('chart.bars_aria')} />{legend}</>)}
      {view === 'scatter' && (dots.length >= 2
        ? <ScatterChart dots={dots} xTitle={t('chart.x_days')} yTitle={t('chart.y_eur')} ariaLabel={t('chart.scatter_aria')} legend={legend} />
        : <p className="small muted">{t('chart.no_transit')}</p>)}
      {view === 'curve' && (<>
        <p className="small muted">{t('chart.curve_note', { n: top.length })}</p>
        <LineChart series={curves} xTitle={t('chart.x_kg')} yTitle={t('chart.y_eur')} ariaLabel={t('chart.curve_aria')} marker={shipment.weightKg} markerLabel={`${shipment.weightKg} kg`}
          tipFor={(x, vals) => (<><strong>{x} kg</strong>{vals.map((v) => <div key={v.name}><i className="swatch" style={{ background: v.color }} /> {v.name}: {v.y === null ? '—' : `${eur0(v.y)} €`}</div>)}</>)} />
      </>)}
    </div>
  );
}
