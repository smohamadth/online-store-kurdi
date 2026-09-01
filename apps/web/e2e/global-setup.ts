// ---------------------------------------------------------------------------
// Playwright global setup — runs once, before the webServer processes and
// every spec. It makes a real stack runnable with a single `npx playwright
// test`:
//
//   1. Ensures apps/api/.env exists (copies the committed `.env.ci` CI
//      template when missing — those values are throwaway/safe).
//   2. Points the web app at the local API for both SSR and the browser.
//   3. Applies migrations and seeds a fresh demo catalogue (admin@store.com
//      / admin123, customer@example.com / customer123, plus products, zones,
//      shipping methods, banners, etc.).
// ---------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const apiDir = path.resolve(__dirname, '../../api');
const webDir = path.resolve(__dirname, '..');

export default function globalSetup() {
  const apiEnv = path.join(apiDir, '.env');
  if (!existsSync(apiEnv)) {
    execSync(`cp ${path.join(apiDir, '.env.ci')} ${apiEnv}`, { stdio: 'inherit' });
  }

  // NEXT_PUBLIC_API_URL is baked in at build time; write it before the web
  // server builds so both SSR (serverFetch) and the browser (API_BASE) hit
  // the local API.
  writeFileSync(path.join(webDir, '.env.local'), 'NEXT_PUBLIC_API_URL=http://127.0.0.1:3001/api\n');

  // Fresh, seeded database. Uses the workspace's own npm scripts so the
  // locally-installed (lockfile-pinned) Prisma binary is used.
  execSync('npm run db:deploy', { cwd: apiDir, stdio: 'inherit' });
  execSync('npm run db:seed', { cwd: apiDir, stdio: 'inherit' });
}
