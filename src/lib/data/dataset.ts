import { z } from 'zod';
import {
  providerSchema, serviceSchema, sourceSchema, tariffFileSchema, transitSchema, restrictionSchema,
  ratesSchema, routesFileSchema, templatesSchema, configSchema,
  type Provider, type Service, type Source, type Tariff, type Transit, type Restriction, type Rates, type Templates, type Route, type ProfileConfig,
} from './schemas';

export interface RawData {
  providers: unknown;
  services: unknown;
  routes: unknown;
  sources: unknown;
  transit: unknown;
  restrictions: unknown;
  rates: unknown;
  templates: unknown;
  config: unknown;
  tariffFiles: unknown[];
}

export interface Dataset {
  providers: Provider[];
  services: Service[];
  routes: Route[];
  countries: { code: string; flag?: string; name: Record<string, string> }[];
  sources: Source[];
  tariffs: Tariff[];
  transit: Transit[];
  restrictions: Restriction[];
  rates: Rates;
  templates: Templates;
  config: ProfileConfig;
}

export function buildDataset(raw: RawData): Dataset {
  const routesFile = routesFileSchema.parse(raw.routes);
  return {
    providers: z.array(providerSchema).parse(raw.providers),
    services: z.array(serviceSchema).parse(raw.services),
    routes: routesFile.routes,
    countries: routesFile.countries,
    config: configSchema.parse(raw.config),
    sources: z.array(sourceSchema).parse(raw.sources),
    tariffs: raw.tariffFiles.flatMap((f) => tariffFileSchema.parse(f).tariffs),
    transit: z.array(transitSchema).parse(raw.transit),
    restrictions: z.array(restrictionSchema).parse(raw.restrictions),
    rates: ratesSchema.parse(raw.rates),
    templates: templatesSchema.parse(raw.templates),
  };
}

export const routeIdFor = (o: string, d: string) => `${o}-${d}`;
export const serviceById = (ds: Dataset, id: string) => ds.services.find((s) => s.id === id);
export const providerById = (ds: Dataset, id: string) => ds.providers.find((p) => p.id === id);
export const tariffsFor = (ds: Dataset, serviceId: string, routeId: string) =>
  ds.tariffs.filter((t) => t.serviceId === serviceId && t.routeId === routeId);
export const transitFor = (ds: Dataset, serviceId: string, routeId: string) =>
  ds.transit.find((t) => t.serviceId === serviceId && t.routeId === routeId);
