/** Node-only access to a data profile (tests, scripts). Choose the profile with SHIPPING_PROFILE (default: demo). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataset } from './dataset';
import { loadProfile } from './profile';

export const PROFILE = process.env.SHIPPING_PROFILE ?? 'demo';
export const PROFILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data', PROFILE);

const profile = await loadProfile(async (p) => JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, p), 'utf8')));
export const rawData = profile.raw;
export const bundledDataset = buildDataset(profile.raw);
export const bundledSnapshot = profile.snapshot;
export const bundledI18n = profile.i18n;
