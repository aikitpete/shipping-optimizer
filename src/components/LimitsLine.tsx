import { useI18n } from '../i18n';
import { useApp } from '../hooks/useApp';
import type { Service } from '../lib/data/schemas';
import { limitParts, limitsFor } from '../lib/data/limits';

/** Compact size/weight limits for a service on one route, with a "not confirmed" tag and source links. */
export function LimitsLine({ svc, routeId, withSources }: { svc: Service; routeId: string; withSources?: boolean }) {
  const { t } = useI18n();
  const { ds } = useApp();
  const l = limitsFor(svc, routeId);
  const parts = limitParts(l).map((p) => t(p.key, p.params));
  const srcs = (l.sourceIds ?? []).map((id) => ds.sources.find((s) => s.id === id)).filter((s) => !!s);
  return (
    <div className="small muted limits">
      <span aria-hidden="true">📐</span> {parts.join(' · ')}
      {!l.confirmed && <span className="badge st-research_estimate"> {t('limits.unconfirmed')}</span>}
      {l.noteKey && <div>{t(l.noteKey)}</div>}
      {withSources && srcs.length > 0 && <div>{srcs.map((s, i) => <span key={s!.id}>{i > 0 && ', '}<a href={s!.url} target="_blank" rel="noreferrer">{s!.title}</a></span>)}</div>}
    </div>
  );
}
