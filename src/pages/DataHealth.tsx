import { StackedBar } from '../components/charts';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import { download } from '../components/common';
import { checkDataset, selfTest, summarize, type Issue, type Severity } from '../lib/validation/check';
import { buildAudit, reverify, type ReverifyReport } from '../lib/validation/reverify';
import { rateAgeDays } from '../lib/pricing/currency';
import { useRemembered } from '../lib/persistence/remember';

export function DataHealthPage() {
  const { t } = useI18n();
  const { ds, snapshot, today } = useApp();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [tests, setTests] = useState<{ name: string; pass: boolean }[] | null>(null);
  const [report, setReport] = useState<ReverifyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [sev, setSev] = useRemembered<Severity | 'all'>('data.severity', () => 'all', (r) => (r === 'all' || r === 'error' || r === 'warning' || r === 'info' ? (r as Severity | 'all') : null));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of ds.tariffs) c[x.status] = (c[x.status] ?? 0) + 1;
    return c;
  }, [ds]);
  const run = () => { setIssues(checkDataset(ds, today, snapshot)); setTests(selfTest(ds, today)); };
  const rev = async () => {
    setBusy(true);
    try { setReport(await reverify(ds, new Date().toISOString(), (u, i) => fetch(u, { ...i, mode: 'cors' }))); } finally { setBusy(false); }
  };
  const sum = issues ? summarize(issues) : null;
  const shown = (issues ?? []).filter((i) => sev === 'all' || i.severity === sev);
  const age = rateAgeDays(ds.rates, today);
  return (
    <div className="page">
      <div className="panel">
        <h2>{t('health.title')}</h2>
        <p className="small muted">{t('health.intro')}</p>
        <div className="row gap wrap">
          <button className="primary" onClick={run}>{t('health.run')}</button>
          <button onClick={() => void rev()} disabled={busy}>{busy ? t('common.working') : t('health.reverify')}</button>
          <button onClick={() => download(`audit-${today}.json`, JSON.stringify(buildAudit(ds, today, snapshot), null, 2))}>{t('health.export')}</button>
        </div>
      </div>
      <div className="panel">
        <h3>{t('health.overview')}</h3>
        <StackedBar ariaLabel={t('chart.status_aria')} segs={Object.entries(counts).map(([k, v], i) => ({ id: k, label: t(`status.${k}`), value: v, color: `var(--c${(i % 4) + 1})` }))} />
        <ul>{Object.entries(counts).map(([k, v]) => <li key={k}>{t(`status.${k}`)}: <strong>{v}</strong></li>)}</ul>
        <p>{t('health.rates', { date: ds.rates.rateDate, age })} {age > 7 && <span className="warn">{t('health.rates_stale')}</span>}</p>
      </div>
      {sum && (
        <div className="panel">
          <h3>{t('health.result')}</h3>
          <p className={sum.errors ? 'bad' : 'ok'}>{t('health.summary', { e: sum.errors, w: sum.warnings, i: sum.info })}</p>
          <div className="row gap">{(['all', 'error', 'warning', 'info'] as const).map((k) => <button key={k} className={sev === k ? 'primary' : ''} onClick={() => setSev(k)}>{t(`health.sev.${k}`)}</button>)}</div>
          <table className="tbl"><tbody>{shown.map((i, n) => <tr key={n} className={`sev-${i.severity}`}><td>{t(`health.sev.${i.severity}`)}</td><td className="small">{i.ref}</td><td className="small">{t(`issue.${i.code}`)} — {i.message}</td></tr>)}</tbody></table>
          {tests && <><h4>{t('health.selftest')}</h4><ul>{tests.map((x) => <li key={x.name} className={x.pass ? 'ok' : 'bad'}>{x.pass ? '✓' : '✗'} {x.name}</li>)}</ul></>}
        </div>
      )}
      {report && (
        <div className="panel">
          <h3>{t('health.reverify_result')}</h3>
          <p className="small muted">{t('health.reverify_note')}</p>
          <table className="tbl"><tbody>{report.probes.map((p) => <tr key={p.sourceId}><td className="small">{p.sourceId}</td><td>{p.reachable === null ? t('health.manual_only') : p.reachable ? t('health.reachable') : t('health.unreachable')}</td><td className="small">{p.httpStatus ?? ''} {p.note}</td></tr>)}</tbody></table>
          <p>{t('health.manual_queue', { n: report.manualQueue.length })}</p>
        </div>
      )}
      <div className="panel">
        <h3>{t('health.sources_title')}</h3>
        <p className="small muted">{t('health.sources_note')}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl"><thead><tr><th>{t('health.src.source')}</th><th>{t('health.src.authority')}</th><th>{t('health.src.truth')}</th><th>{t('health.src.accessed')}</th></tr></thead>
            <tbody>{[...ds.sources].map((x) => ({ x, main: ds.tariffs.filter((tr) => tr.primarySourceId === x.id).length, sup: ds.tariffs.filter((tr) => tr.primarySourceId !== x.id && tr.sourceIds.includes(x.id)).length })).sort((a, b) => b.main - a.main || b.sup - a.sup).map(({ x, main, sup }) => (
              <tr key={x.id}><td className="small"><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a><br /><span className="muted">{x.url}</span></td><td className="small">{t(`authority.${x.authority}`)}</td><td className="small">{main > 0 ? t('health.src.main', { n: main }) : sup > 0 ? t('health.src.support', { n: sup }) : '–'}</td><td className="small">{x.accessedAt ?? t('tar.not_accessed')}</td></tr>
            ))}</tbody></table>
        </div>
      </div>
    </div>
  );
}
