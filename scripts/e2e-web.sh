#!/usr/bin/env bash
# Build + start the Next.js storefront for Playwright E2E. Builds first so
# the test runs against the production bundle (catches build-time regressions
# too), then serves it on :3000 for Playwright's `webServer` to wait on.
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
npx next build
exec npx next start -H 127.0.0.1 -p 3000
