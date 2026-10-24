import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import type { Shipment } from '../lib/data/schemas';
import { groupOf, guideForRoute, presetsOf, routeInGroup, type Preset } from '../lib/recommendations/guide';
import type { Candidate } from '../lib/recommendations/recommend';
import { Money, StatusBadge } from './common';

function transit(c: Candidate, t: ReturnType<typeof useI18n>['t']) {
  if (!c.transit) return t('transit.unknown');
  const d = c.transit.minDays === c.transit.maxDays ? `${c.transit.minDays}` : `${c.transit.minDays}–${c.transit.maxDays}`;
  return `${t('transit.days', { d })}${c.transit.status === 'research_estimate' ? ' ' + t('transit.estimate') : ''}`;
}

function Card({ label, c }: { label: string; c: Candidate | null }) {
  const { t } = useI18n();
  return (
    <div className="pick">
      <div className="small muted">{label}</div>
      {c ? (<>
        <strong>{c.service.name}</strong><div className="small muted">{c.provider?.name}</div>
        <div><Money amount={c.price.nativeAmount} currency={c.price.currency} /></div>
        {c.price.packageName && <div className="small muted">{c.price.packageName}</div>}
        <div className="small">{transit(c, t)}</div>
        <StatusBadge status={c.price.tariffStatus} />
      </>) : <span className="muted">{t('pick.none')}</span>}
    </div>
  );
}

export function PackageGuide({ shipment, onPreset }: { shipment: Shipment; onPreset: (p: Preset) => void }) {
  const { t } = useI18n();
  const { ds, prefs, today } = useApp();
  const PRESETS = useMemo(() => presetsOf(ds), [ds]);
  const o = shipment.originCountry, d = shipment.destinationCountry;
  const active = PRESETS.find((p) => p.category === shipment.category && p.weightKg === shipment.weightKg && p.dims[0] === shipment.lengthCm && p.dims[1] === shipment.widthCm && p.dims[2] === shipment.heightCm);
  const eligible = !!active && routeInGroup(ds, active.group, o, d);
  const g = useMemo(() => (active && eligible ? guideForRoute(active, o, d, ds, prefs.rankWeights, today) : null), [active, eligible, o, d, ds, prefs.rankWeights, today]);
  const chips = (grp: string) => <div className="chips" role="group" aria-label={t(`guide.group.${grp}.title`)}>{PRESETS.filter((p) => p.group === grp).map((p) => <button key={p.id} className={active?.id === p.id ? 'active' : ''} onClick={() => onPreset(p)}>{t(`guide.preset.${p.id}`)}</button>)}</div>;
  return (
    <div className="panel">
      <h2>{t('guide.title')}</h2>
      <p className="small muted">{t('guide.intro')}</p>
      {ds.config.guide.groups.map((gr) => <div key={gr.id}><h4>{t(`guide.group.${gr.id}.title`)}</h4>{chips(gr.id)}</div>)}
      {active && <p className="small muted">{t('guide.preset_dims', { w: String(active.weightKg), l: String(active.dims[0]), b: String(active.dims[1]), h: String(active.dims[2]) })}</p>}
      {g ? (<>
        <div className="picks">
          <Card label={t(`guide.group.${active!.group}.standard`)} c={g.standard} />
          <Card label={t(`guide.group.${active!.group}.faster`)} c={g.faster} />
          <Card label={t(`guide.group.${active!.group}.fastest`)} c={g.fastest} />
        </div>
        <p className="small muted">{(() => { const k = `guide.group.${active!.group}.note.${d}`; const v = t(k); return v !== k ? v : t(`guide.group.${active!.group}.note`); })()}</p>
        <h4>{t('guide.when_title')}</h4>
        <ol className="msgs">{g.ranked.filter((c) => t(`use.${c.service.id}`) !== `use.${c.service.id}`).map((c) => { const id = c.service.id; return <li key={id}><strong>{c.service.name}</strong> ({c.provider?.name}) · <Money amount={c.price.nativeAmount} currency={c.price.currency} /> — {t(`use.${id}`)}</li>; })}</ol>
      </>) : <p className="small muted">{t(active ? 'guide.route_mismatch' : 'guide.pick_preset')}</p>}
    </div>
  );
}
