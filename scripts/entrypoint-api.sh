#!/bin/sh
# API container entrypoint: converge the database, then start the server.
#
# `migrate deploy` applies every committed migration that the database
# has not seen yet. On a fresh client-server install the database starts
# empty and ends up exactly matching this image's schema; on an upgrade
# it only applies the new migrations.
set -e

echo "==> store-api: applying database migrations (prisma migrate deploy)"
node_modules/.bin/prisma migrate deploy || npx prisma migrate deploy

echo "==> store-api: starting server on :${PORT:-3001}"
exec node dist/server.js
