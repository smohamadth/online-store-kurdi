-- Add per-store payment gateway configuration (JSON map of gatewayId -> config).
-- Secret credentials are stored ONLY here; the public settings endpoint
-- returns a scrubbed metadata list. See modules/payments/gatewayConfig.ts.
ALTER TABLE "StoreSettings" ADD COLUMN "paymentGateways" TEXT NOT NULL DEFAULT '{}';
