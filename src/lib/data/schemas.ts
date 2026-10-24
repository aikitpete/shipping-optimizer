import { z } from 'zod';

export const tri = z.union([z.boolean(), z.literal('unconfirmed')]);
export type Tri = z.infer<typeof tri>;

export const verificationStatus = z.enum([
  'verified_published',
  'verified_live',
  'historical',
  'research_estimate',
  'unverified_lead',
  'quote_required',
  'not_available',
]);
export type VerificationStatus = z.infer<typeof verificationStatus>;

/** ISO 3166-1 alpha-3 code. The set of countries comes from the active data profile (routes file), not from code. */
export const countryCode = z.string().regex(/^[A-Z]{3}$/);
export type CountryCode = z.infer<typeof countryCode>;

export const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  kind: z.enum(['official_page', 'official_pdf', 'official_calculator', 'secondary', 'user_seed']),
  /** Who stands behind the number. Precedence: regulator > carrier_official > carrier_calculator > secondary > seed. */
  authority: z.enum(['regulator', 'carrier_official', 'carrier_calculator', 'secondary', 'seed']).default('secondary'),
  accessedAt: z.string().nullable(),
  fetchable: z.boolean(),
  accessNote: z.string().optional(),
  locator: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;
export const AUTHORITY_RANK = { regulator: 0, carrier_official: 1, carrier_calculator: 2, secondary: 3, seed: 4 } as const;

export const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['postal', 'courier', 'aggregator']),
  country: z.string(),
  website: z.string().url(),
});
export type Provider = z.infer<typeof providerSchema>;

export const routeSchema = z.object({ id: z.string(), origin: countryCode, destination: countryCode });
export type Route = z.infer<typeof routeSchema>;
export const countrySchema = z.object({ code: countryCode, flag: z.string().optional(), name: z.object({ en: z.string() }).catchall(z.string()) });
export const routesFileSchema = z.object({ countries: z.array(countrySchema), routes: z.array(routeSchema) });

export const limitsSchema = z.object({
  /** Longest side. */
  maxLengthCm: z.number().optional(),
  /** Length + girth, girth = 2 x (width + height). */
  maxSumCm: z.number().optional(),
  /** Length + width + height. */
  maxTotalCm: z.number().optional(),
  /** Longest + shortest side. */
  maxSideSumCm: z.number().optional(),
  /** Largest box, sorted longest first. */
  maxDimsCm: z.array(z.number()).max(3).optional(),
  /** Smallest allowed face [long, short]. */
  minFaceCm: z.tuple([z.number(), z.number()]).optional(),
  /** Weight limit for this route (falls back to the service maxKg). */
  maxKg: z.number().positive().optional(),
  confirmed: z.boolean(),
  sourceIds: z.array(z.string()).default([]),
  noteKey: z.string().optional(),
});
export type Limits = z.infer<typeof limitsSchema>;

export const serviceSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  kind: z.string(),
  routes: z.array(z.string()),
  docsOnly: z.boolean(),
  allowsMerchandise: z.boolean(),
  maxKg: z.number().positive(),
  limits: limitsSchema,
  /** Per-route overrides (e.g. a lower weight limit or a different size class for one destination). */
  routeLimits: z.record(limitsSchema).default({}),
  dimDivisor: z.number().positive().nullable(),
  tracking: tri,
  signature: tri,
  insurance: tri,
  irreplaceable: tri,
  lithium: z.enum(['unconfirmed', 'allowed', 'restricted', 'prohibited']),
  senderTypes: z.object({ private: tri, business: tri }),
  businessAccountRequired: tri,
  dropoff: z.string(),
  collection: tri,
  availability: z.enum(['bookable', 'quote_only', 'lead']),
  unavailableRoutes: z.record(z.string()),
  /** i18n key describing who may use the service and how to buy it. */
  accessKey: z.string().optional(),
  bookingUrl: z.string().url().optional(),
});
export type Service = z.infer<typeof serviceSchema>;

const optionalCharge = z.object({
  kind: z.string(),
  coverEur: z.number().optional(),
  amount: z.number(),
  currency: z.string(),
  status: verificationStatus,
});

const tariffBase = {
  id: z.string(),
  serviceId: z.string(),
  routeId: z.string(),
  currency: z.string().length(3),
  appliesTo: z.enum(['all', 'documents', 'merchandise']),
  channel: z.string(),
  vatMode: z.enum(['included', 'excluded', 'exempt', 'unknown']),
  fuelSurcharge: z.enum(['included', 'excluded', 'unknown']),
  confidence: z.enum(['high', 'medium', 'low']),
  status: verificationStatus,
  sourceIds: z.array(z.string()),
  /** The single source of truth for this price. Other sourceIds only corroborate. */
  primarySourceId: z.string().nullable().default(null),
  lastVerified: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  conflicts: z.array(z.string()),
  noteKeys: z.array(z.string()),
  optionalCharges: z.array(optionalCharge),
};

export const bracketSchema = z.object({ minKg: z.number().min(0), maxKg: z.number().positive(), price: z.number().nonnegative() });
export const packageSchema = z.object({
  id: z.string(),
  name: z.string(),
  dimsCm: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  maxKg: z.number().positive(),
  docsOnly: z.boolean(),
  price: z.number().nonnegative(),
  /** Size rule of some carriers (e.g. parcel shops): longest side + shortest side must not exceed this many cm. */
  sumCm: z.number().positive().optional(),
});

export const tariffSchema = z.discriminatedUnion('type', [
  z.object({ ...tariffBase, type: z.literal('weight_brackets'), brackets: z.array(bracketSchema).min(1) }),
  z.object({ ...tariffBase, type: z.literal('fixed_packages'), packages: z.array(packageSchema).min(1) }),
  z.object({ ...tariffBase, type: z.literal('sample_points'), points: z.array(z.object({ kg: z.number().positive(), price: z.number().nonnegative() })).min(1) }),
  z.object({ ...tariffBase, type: z.literal('quote_only'), quoteUrl: z.string().url().optional() }),
]);
export type Tariff = z.infer<typeof tariffSchema>;
export const tariffFileSchema = z.object({ tariffs: z.array(tariffSchema) });

export const transitSchema = z.object({
  serviceId: z.string(),
  routeId: z.string(),
  minDays: z.number().nonnegative(),
  maxDays: z.number().nonnegative(),
  guaranteed: z.boolean(),
  status: verificationStatus,
  sourceIds: z.array(z.string()),
  lastVerified: z.string().nullable(),
  noteKey: z.string().nullable(),
});
export type Transit = z.infer<typeof transitSchema>;

export const restrictionSchema = z.object({
  id: z.string(),
  kind: z.enum(['collection', 'eligibility', 'insurance', 'dangerous_goods', 'customs', 'documents']),
  appliesTo: z.array(z.string()),
  routes: z.array(z.string()),
  status: z.enum(['eligibility_not_confirmed', 'confirmed_allowed', 'confirmed_restricted']),
  links: z.array(z.string()),
  lastVerified: z.string().nullable(),
});
export type Restriction = z.infer<typeof restrictionSchema>;

export const ratesSchema = z.object({
  base: z.literal('EUR'),
  source: z.string(),
  sourceUrl: z.string(),
  rateDate: z.string(),
  fetchedAt: z.string(),
  status: verificationStatus,
  rates: z.record(z.number().positive()),
  note: z.string().optional(),
});
export type Rates = z.infer<typeof ratesSchema>;

export const batterySchema = z.object({
  type: z.enum(['none', 'lithium_ion', 'lithium_metal']).default('none'),
  quantity: z.number().int().nonnegative().default(0),
  installed: z.boolean().default(false),
});

export const categories = [
  'documents', 'original_documents', 'certified_copies', 'clothing', 'electronics', 'books', 'gifts', 'mixed_goods', 'other',
] as const;
export const documentCategories: readonly string[] = ['documents', 'original_documents', 'certified_copies'];

export const snapshotSchema = z.object({
  serviceId: z.string(),
  tariffId: z.string().nullable(),
  nativeAmount: z.number().nullable(),
  currency: z.string().nullable(),
  eur: z.number().nullable(),
  capturedAt: z.string(),
});
export type PriceSnapshot = z.infer<typeof snapshotSchema>;

export const shipmentSchema = z.object({
  id: z.string(),
  nameKey: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
  descriptionKey: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  originCountry: countryCode,
  destinationCountry: countryCode,
  originPostal: z.string().default(''),
  destinationPostal: z.string().default(''),
  category: z.enum(categories).default('documents'),
  weightKg: z.number().positive().default(0.5),
  lengthCm: z.number().positive().nullable().default(null),
  widthCm: z.number().positive().nullable().default(null),
  heightCm: z.number().positive().nullable().default(null),
  weightProvisional: z.boolean().default(false),
  dimsProvisional: z.boolean().default(false),
  quantity: z.number().int().positive().default(1),
  packages: z.number().int().positive().default(1),
  declaredValueEur: z.number().nonnegative().nullable().default(null),
  insuranceDesired: z.boolean().default(false),
  trackingRequired: z.boolean().default(false),
  signatureRequired: z.boolean().default(false),
  irreplaceable: z.boolean().default(false),
  deadlineDays: z.number().positive().nullable().default(null),
  budgetPreference: z.enum(['cheapest', 'balanced', 'fastest']).default('balanced'),
  senderType: z.enum(['private', 'business']).default('private'),
  servicePointDropoff: z.boolean().default(true),
  pickupRequired: z.boolean().default(false),
  deliveryMethod: z.enum(['any', 'home', 'facility_collection']).default('any'),
  customsNotes: z.string().default(''),
  battery: batterySchema.default({}),
  notes: z.string().default(''),
  selectedServiceId: z.string().nullable().default(null),
  selectedPriceSnapshot: snapshotSchema.nullable().default(null),
  preferredProviderId: z.string().nullable().default(null),
  /** false = this leg is switched off for the plan: kept in the data but ignored in totals, strategies and sequence. */
  enabled: z.boolean().default(true),
  dependsOn: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type Shipment = z.infer<typeof shipmentSchema>;

export const CURRENT_SCHEMA = 3;

export const planSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().default(CURRENT_SCHEMA),
  nameKey: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
  notes: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  shipments: z.array(shipmentSchema),
});
export type Plan = z.infer<typeof planSchema>;

export const templatesSchema = z.object({
  plans: z.array(z.object({
    id: z.string(),
    nameKey: z.string(),
    shipments: z.array(z.any()).optional(),
    basedOn: z.string().optional(),
    countrySwap: z.record(z.string()).optional(),
  })),
  shipments: z.array(z.object({ id: z.string(), nameKey: z.string(), shipment: z.any() })),
});
export type Templates = z.infer<typeof templatesSchema>;

const presetSchema = z.object({
  id: z.string(),
  category: z.enum(categories),
  weightKg: z.number().positive(),
  dims: z.tuple([z.number(), z.number(), z.number()]),
  docs: z.boolean().default(false),
});
export type PresetDef = z.infer<typeof presetSchema>;
const guideGroupSchema = z.object({
  id: z.string(),
  /** Routes ("ORG-DST") the group's package presets apply to. */
  routes: z.array(z.string()).min(1),
  /** Route used when a preset is picked and the current route is not in the group. */
  defaultRoute: z.string(),
  /** 'faster': next service that is quicker and dearer than the standard pick. 'other_provider': cheapest from a different provider. */
  fasterRule: z.enum(['faster', 'other_provider']).default('faster'),
  /** Service preferred as the "standard" pick for document presets, when it is priced. */
  docServiceId: z.string().optional(),
  presets: z.array(presetSchema),
});
export type GuideGroup = z.infer<typeof guideGroupSchema>;

/** Per-profile configuration: what the app shows first, which routes are mandatory, how the package guide is laid out. */
export const configSchema = z.object({
  profile: z.string(),
  title: z.string(),
  /** True for the public showcase dataset (shows a banner). */
  demo: z.boolean().default(false),
  /** Languages this profile offers (codes known to src/i18n/languages.ts). The first is the default. */
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).default(['en']),
  defaultPlanId: z.string(),
  quickDefault: z.object({ origin: countryCode, destination: countryCode, category: z.enum(categories), weightKg: z.number().positive() }),
  newShipmentRoute: z.object({ origin: countryCode, destination: countryCode }),
  requiredRoutes: z.array(z.string()).default([]),
  /** Countries whose tariffs must stay independent records (e.g. two neighbours that happen to share a price today). */
  pairedCountries: z.array(z.tuple([countryCode, countryCode])).default([]),
  guide: z.object({ groups: z.array(guideGroupSchema) }).default({ groups: [] }),
});
export type ProfileConfig = z.infer<typeof configSchema>;
