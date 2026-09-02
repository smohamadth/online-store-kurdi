#!/usr/bin/env bash
# Start the API for Playwright E2E. Playwright's `webServer` treats this as
# the long-running process it waits on (GET /health -> 200) and kills when
# the run finishes.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
exec npx tsx src/server.ts
