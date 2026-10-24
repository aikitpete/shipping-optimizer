import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AppContext, type AppCtx } from '../src/hooks/useApp';
import { I18nProvider } from '../src/i18n';
import { PlannerPage } from '../src/pages/Planner';
import { QuickComparePage } from '../src/pages/QuickCompare';
import { TariffsPage } from '../src/pages/Tariffs';
import { DataHealthPage } from '../src/pages/DataHealth';
import { SettingsPage } from '../src/pages/Settings';
import { DEFAULT_PREFS, type Lang } from '../src/lib/persistence/prefs';
import { createDefaultPlan, selectService } from '../src/lib/plans/ops';
import { planFromTemplate } from '../src/lib/plans/templates';
import { ds, TODAY } from './helpers/fixtures';
import type { Plan } from '../src/lib/data/schemas';

const NOW = '2026-10-13T10:00:00.000Z';
const noop = async () => undefined;
function render(el: React.ReactElement, lang: Lang, plan: Plan) {
  const plans = [plan, planFromTemplate(ds, 'blank', NOW)!];
  const ctx: AppCtx = { ds, snapshot: {}, today: TODAY, prefs: { ...DEFAULT_PREFS, lang }, setPrefs: () => undefined, plans, plan, savePlan: noop, addPlan: noop, removePlan: noop, reloadPlans: noop, resetAll: noop, selectPlan: () => undefined };
  return renderToString(<I18nProvider lang={lang}><AppContext.Provider value={ctx}>{el}</AppContext.Provider></I18nProvider>);
}

describe('pages render without a browser', () => {
  const plan = createDefaultPlan(ds, NOW);
  const allOn = plan;
  for (const lang of ds.config.languages) {
    it(`planner (${lang}) shows 6 shipments and the plan name`, () => {
      const html = render(<PlannerPage />, lang, plan);
      expect((html.match(/<article/g) ?? []).length).toBe(6);
      expect(html).toContain(({ en: 'Kestrel K1 launch, Q4', de: 'Kestrel K1 Launch, Q4' } as Record<string, string>)[lang]);
      expect(html).not.toMatch(/Total for all/);
    });
    it(`every other page renders (${lang})`, () => {
      for (const el of [<QuickComparePage />, <TariffsPage />, <DataHealthPage />, <SettingsPage />]) expect(render(el, lang, plan).length).toBeGreaterThan(200);
    });
  }
  it('a fully priced plan shows a final total', () => {
    let p = allOn;
    p = selectService(p, ds, 'ship-1', 'mx-envelope', NOW, TODAY);
    p = selectService(p, ds, 'ship-2', 'mx-economy', NOW, TODAY);
    p = selectService(p, ds, 'ship-3', 'np-parcel-economy', NOW, TODAY);
    p = selectService(p, ds, 'ship-4', 'np-parcel-economy', NOW, TODAY);
    p = selectService(p, ds, 'ship-5', 'mx-economy', NOW, TODAY);
    p = selectService(p, ds, 'ship-6', 'mx-express', NOW, TODAY);
    const html = render(<PlannerPage />, 'en', p);
    expect(html).toContain('Total for all 6 shipments');
  });
  it('the demo banner is part of the app shell, not the data', () => {
    expect(ds.config.demo).toBe(true);
  });
  it('raw i18n keys never leak into the rendered pages', () => {
    for (const lang of ds.config.languages) {
      const html = render(<PlannerPage />, lang, plan) + render(<TariffsPage />, lang, plan) + render(<SettingsPage />, lang, plan);
      expect(html).not.toMatch(/>(?:app|nav|form|plan|rec|opt|tar|totals|settings|health)\.[a-z_.]+</);
    }
  });
});
