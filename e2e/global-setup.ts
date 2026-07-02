import { mkdir } from 'node:fs/promises';
import { resetToSeed } from './reset';

// Runs once before the suite: reset the DB to the known seed so every run (and rerun) starts from an
// identical state, and make sure the screenshot target dir exists before any test writes to it.
export default async function globalSetup(): Promise<void> {
  await mkdir('.dev/logs', { recursive: true });
  await resetToSeed();
}
