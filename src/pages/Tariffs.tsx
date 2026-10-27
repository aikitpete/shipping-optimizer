import { Fragment, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { Money, StatusBadge, useCountryName } from '../components/common';
import type { Tariff } from '../lib/data/schemas';
import { LimitsLine } from '../components/LimitsLine';
import { useRemembered } from '../lib/persistence/remember';

function Detail({ tr }: { tr: Tariff }) {
  const { t } = useI18n();
  const { ds } = useApp();
  return (
    <div className="detail">
      {tr.type === 'weight_brackets' && <table className="tbl"><thead><tr><th>kg</th><th>{t('rec.price')}</th></tr></thead><tbody>{tr.brackets.map((b, i) => <tr key={i}><td>{b.minKg} – {b.maxKg}</td><td><Money amount={b.price} currency={tr.currency} /></td></tr>)}</tbody></table>}
      {tr.type === 'fixed_packages' && <table className="tbl"><thead><tr><th>{t('tar.package')}</th><th>cm</th><th>kg</th><th>{t('rec.price')}</th></tr></thead><tbody>{tr.packages.map((p) => <tr key={p.id}><td>{p.name}{p.docsOnly ? ` (${t('tar.docs_only')})` : ''}</td><td>{p.dimsCm ? p.dimsCm.join(' × ') : '—'}</td><td>{p.maxKg}</td><td><Money amount={p.price} currency={tr.currency} /></td></tr>)}</tbody></table>}
      {tr.type === 'sample_points' && <ul>{tr.points.map((p, i) => <li key={i}>{p.kg} kg: <Money amount={p.price} currency={tr.currency} /></li>)}</ul>}
      {tr.type === 'quote_only' && <p>{t('tar.quote_only')} {tr.quoteUrl && <a href={tr.quoteUrl} target="_blank" rel="noreferrer">{t('rec.open_quote')}</a>}</p>}
      <ul className="msgs">{tr.noteKeys.map((k) => <li key={k}>{t(k)}</li>)}{tr.conflicts.map((k) => <li key={k} className="bad">{t(k)}</li>)}</ul>
      <p className="small muted">{t('tar.vat')}: {t(`vat.${tr.vatMode}`)} · {t('tar.fuel')}: {t(`fuel.${tr.fuelSurcharge}`)} · {t('tar.last_verified')}: {tr.lastVerified ?? t('tar.never')} · {t('tar.confidence')}: {t(`conf.${tr.confidence}`)}</p>
      <p className="small">{t('tar.truth')}: {(() => { const ps = ds.sources.find((x) => x.id === tr.primarySourceId); return ps ? <span><a href={ps.url} target="_blank" rel="noreferrer">{ps.title}</a> ({t(`authority.${ps.authority}`)})</span> : <span className="warn">{t('tar.truth_none')}</span>; })()} · {t('tar.channel')}: {t(`channel.${tr.channel}`)} · {t('tar.effective')}: {tr.effectiveDate ?? t('tar.never')}</p>
      <p className="small">{t('tar.sources')}: {tr.sourceIds.map((id) => { const s = ds.sources.find((x) => x.id === id); return s ? <span key={id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{s.accessedAt ? ` (${s.accessedAt})` : ` (${t('tar.not_accessed')})`}; </span> : null; })}</p>
    </div>
  );
}

export function TariffsPage() {
  const { t } = useI18n();
  const cname = useCountryName();
  const { ds } = useApp();
  const [route, setRoute] = useRemembered<string>('tariffs.route', () => '', (r) => (typeof r === 'string' ? r : null));
  const [status, setStatus] = useRemembered<string>('tariffs.status', () => '', (r) => (typeof r === 'string' ? r : null));
  const rows = useMemo(() => ds.tariffs.filter((x) => (!route || x.routeId === route) && (!status || x.status === status)), [ds, route, status]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="page">
      <div className="panel row gap wrap">
        <label className="field inline"><span>{t('tar.route')}</span><select value={route} onChange={(e) => setRoute(e.target.value)}><option value="">{t('tar.all')}</option>{ds.routes.map((r) => <option key={r.id} value={r.id}>{cname(r.origin)} → {cname(r.destination)}</option>)}</select></label>
        <label className="field inline"><span>{t('rec.status')}</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('tar.all')}</option>{[...new Set(ds.tariffs.map((x) => x.status))].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select></label>
        <span className="muted small">{t('tar.count', { n: rows.length })}</span>
      </div>
      <p className="small muted">{t('tar.disclaimer')}</p>
      <details className="panel">
        <summary><strong>{t('limits.title')}</strong> <span className="muted small">({ds.services.filter((sv) => route ? sv.routes.includes(route) : true).length})</span></summary>
        <p className="small muted">{t('limits.girth_help')}</p>
        <table className="tbl stack"><thead><tr><th>{t('rec.service')}</th><th>{t('limits.title')}</th></tr></thead><tbody>
          {ds.services.filter((sv) => route ? sv.routes.includes(route) : true).map((sv) => (
            <tr key={sv.id}><td data-label="">{sv.name}</td><td data-label=""><LimitsLine svc={sv} routeId={route || sv.routes[0] || ''} withSources /></td></tr>
          ))}
        </tbody></table>
      </details>
      <table className="tbl stack"><thead><tr><th>{t('rec.service')}</th><th>{t('tar.route')}</th><th>{t('rec.status')}</th><th>{t('tar.currency')}</th><th /></tr></thead><tbody>
        {rows.map((x) => (<Fragment key={x.id}>
          <tr><td data-label="">{ds.services.find((s) => s.id === x.serviceId)?.name}{x.channel !== 'unknown' && <span className="muted small"> · {t(`channel.${x.channel}`)}</span>}{x.appliesTo !== 'all' && <span className="muted small"> ({t(`tar.applies.${x.appliesTo}`)})</span>}</td><td data-label={t('tar.route')}>{x.routeId}</td><td data-label={t('rec.status')}><StatusBadge status={x.status} /></td><td data-label={t('tar.currency')}>{x.currency}</td><td data-label=""><button onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? t('common.hide') : t('tar.details')}</button></td></tr>
          {open === x.id && <tr><td data-label="" colSpan={5}><Detail tr={x} /></td></tr>}
        </Fragment>))}
      </tbody></table>
    </div>
  );
}
