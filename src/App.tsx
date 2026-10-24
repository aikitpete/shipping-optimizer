import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18nProvider, translate } from './i18n';
import { LANGUAGES, localeOf } from './i18n/languages';
import { AppContext, type AppCtx } from './hooks/useApp';
import type { Dataset } from './lib/data/dataset';
import type { Plan } from './lib/data/schemas';
import { deletePlan, ensureDefaultPlan, listPlans, resetToDefaults, savePlan as dbSave } from './lib/persistence/db';
import { loadPrefs, savePrefs, type Prefs } from './lib/persistence/prefs';
import { PlannerPage } from './pages/Planner';
import { QuickComparePage } from './pages/QuickCompare';
import { TariffsPage } from './pages/Tariffs';
import { DataHealthPage } from './pages/DataHealth';
import { SettingsPage } from './pages/Settings';

function SavePill({ s, lang }: { s: { status: 'idle' | 'saving' | 'saved' | 'error'; at: string | null }; lang: string }) {
  if (s.status === 'idle') return null;
  const tt = (k: string) => translate(lang, k);
  const time = s.at ? new Date(s.at).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' }) : '';
  return <span className={`savepill ${s.status}`} role="status" aria-live="polite">{s.status === 'saving' ? tt('save.saving') : s.status === 'saved' ? `✓ ${tt('save.saved')} ${time}` : `⚠ ${tt('save.error')}`}</span>;
}

type Tab = 'planner' | 'compare' | 'tariffs' | 'health' | 'settings';
const TABS: Tab[] = ['planner', 'compare', 'tariffs', 'health', 'settings'];

export default function App({ ds, snapshot, storeKind }: { ds: Dataset; snapshot: Record<string, string>; storeKind?: string }) {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tab, setTab] = useState<Tab>('planner');
  const [ready, setReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; at: string | null }>({ status: 'idle', at: null });
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const setPrefs = useCallback((p: Partial<Prefs>) => setPrefsState((cur) => { const next = { ...cur, ...p }; savePrefs(next); return next; }), []);

  const lang = ds.config.languages.includes(prefs.lang) ? prefs.lang : ds.config.languages[0];
  useEffect(() => { document.documentElement.lang = lang; document.title = ds.config.title; }, [lang, ds]);

  useEffect(() => {
    ensureDefaultPlan(ds, new Date().toISOString())
      .then((p) => { setPlans(p); setReady(true); })
      .catch((e) => { setDbError(String(e)); setReady(true); });
  }, [ds]);

  const plan = plans.find((p) => p.id === prefs.selectedPlanId) ?? plans[0] ?? null;

  const ctx: AppCtx = {
    ds, snapshot, today, prefs: { ...prefs, lang }, setPrefs, plans, plan,
    saveStatus,
    savePlan: async (p) => {
      setPlans((cur) => cur.map((x) => (x.id === p.id ? p : x)));
      pending.current++;
      setSaveStatus((s) => ({ ...s, status: 'saving' }));
      const run = saveChain.current.catch(() => undefined).then(() => dbSave(p));
      saveChain.current = run;
      try { await run; if (--pending.current === 0) setSaveStatus({ status: 'saved', at: new Date().toISOString() }); }
      catch (e) { pending.current--; setSaveStatus({ status: 'error', at: new Date().toISOString() }); throw e; }
    },
    addPlan: async (p, select) => { await dbSave(p); setPlans((cur) => [...cur, p]); if (select) setPrefs({ selectedPlanId: p.id }); },
    removePlan: async (id) => {
      if (plans.length <= 1) return;
      await deletePlan(id);
      const rest = plans.filter((p) => p.id !== id);
      setPlans(rest);
      if (prefs.selectedPlanId === id) setPrefs({ selectedPlanId: rest[0]?.id ?? null });
    },
    reloadPlans: async () => setPlans(await listPlans()),
    resetAll: async () => { const p = await resetToDefaults(ds, new Date().toISOString()); setPlans(p); setPrefs({ selectedPlanId: p[0].id }); },
    selectPlan: (id) => setPrefs({ selectedPlanId: id }),
  };
  const t = (k: string) => translate(lang, k);

  return (
    <I18nProvider lang={lang}>
      <AppContext.Provider value={ctx}>
        <header className="top">
          <h1>{ds.config.title}</h1>
          <nav aria-label="Main">{TABS.map((x) => <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)} aria-current={tab === x ? 'page' : undefined}>{t(`nav.${x}`)}</button>)}</nav>
          <SavePill s={saveStatus} lang={lang} />
          <div className="langs" role="group" aria-label={t('settings.language')}>
            {ds.config.languages.length > 1 && ds.config.languages.map((l) => <button key={l} className={lang === l ? 'active' : ''} onClick={() => setPrefs({ lang: l })}>{LANGUAGES[l]?.short ?? l.toUpperCase()}</button>)}
          </div>
        </header>
        {ds.config.demo && <div className="banner">{t('app.demo')}</div>}
        <div className="banner">{t('app.disclaimer')}</div>
        {dbError && <div className="banner bad">{t('app.db_error')}</div>}
        <main>
          {!ready ? <p>{t('plan.loading')}</p> : tab === 'planner' ? <PlannerPage /> : tab === 'compare' ? <QuickComparePage /> : tab === 'tariffs' ? <TariffsPage /> : tab === 'health' ? <DataHealthPage /> : <SettingsPage />}
        </main>
      </AppContext.Provider>
    </I18nProvider>
  );
}
