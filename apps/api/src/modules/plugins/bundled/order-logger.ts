// ---------------------------------------------------------------------------
// order-logger — the platform's example bundled plugin.
//
// Demonstrates the bundled-code tier: a plugin that runs IN-PROCESS (here:
// logs order/payment events through the platform logger). Bundled plugins
// are reviewed code shipped with the platform — see
// docs/PLUGIN_DEVELOPMENT.md §5 for the contract.
// ---------------------------------------------------------------------------
import { logger } from '../../../utils/logger';
import type { PluginHandlers } from '../bundledRegistry';

export const orderLogger: PluginHandlers = {
  id: 'order-logger',

  async onOrderCreated(payload, ctx) {
    const p = payload as { orderNumber?: string; total?: number; paymentMethod?: string };
    logger.info(
      `[plugin:order-logger] order.created ${p.orderNumber ?? '?'} — total ${p.total ?? 0}, payment ${p.paymentMethod ?? 'unknown'} (event ${ctx.eventId})`
    );
  },

  async onPaymentSettled(payload, ctx) {
    const p = payload as { orderNumber?: string; transactionId?: string; gateway?: string };
    logger.info(
      `[plugin:order-logger] payment.settled ${p.orderNumber ?? '?'} — tx ${p.transactionId ?? 'n/a'} via ${p.gateway ?? 'unknown'} (event ${ctx.eventId})`
    );
  },
};
