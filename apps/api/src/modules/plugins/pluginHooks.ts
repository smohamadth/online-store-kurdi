// ---------------------------------------------------------------------------
// Hook registry + emitter.
//
// Business code emits events (order.created, payment.settled, ...) with a
// JSON payload; the emitter fans out to:
//   1. installed plugins that declared the hook and have a configured URL
//      (webhook dispatch — fire-and-forget for the caller),
//   2. bundled plugin code handlers (the static import map, registered at
//      module load from bundledRegistry.ts).
//
// `emit` NEVER throws and never blocks the caller for webhook latency: the
// returned outcomes are for callers that explicitly await (tests, the admin
// "test" endpoint); route-level emitters use `void emit(...)`.
// ---------------------------------------------------------------------------
import crypto from 'crypto';
import { dispatchWebhook, type WebhookResult } from './pluginWebhook';
import { listEnabledInstalledPlugins, appendExecLog } from './plugins.service';
import { HOOK_METHODS, type HookName } from './plugin.schema';
import type { PluginHandlers } from './bundledRegistry';
import { BUNDLED_PLUGINS } from './bundledRegistry';
import { logger } from '../../utils/logger';

export type { HookName };
export type { PluginHandlers };

export interface EmitOutcome {
  pluginId: string;
  kind: 'webhook' | 'code';
  delivered?: boolean;
  status?: number;
  error?: string;
}

const codeHandlers = new Map<string, PluginHandlers>();

// Register the bundled (in-process) plugins at module load — the static
// import map, same pattern as themeSections.tsx. These are reviewed
// platform code; installed plugins can never reach this map.
for (const plugin of BUNDLED_PLUGINS) {
  codeHandlers.set(plugin.id, plugin);
}

export function listRegisteredCodeHandlers(): string[] {
  return [...codeHandlers.keys()];
}

/**
 * Emit an event. Fans out to enabled installed plugins (webhook) and
 * registered bundled handlers (code). Never throws.
 */
export async function emit(event: HookName, data: unknown): Promise<EmitOutcome[]> {
  const outcomes: EmitOutcome[] = [];
  const eventId = crypto.randomUUID();
  const envelope = {
    event,
    eventId,
    occurredAt: new Date().toISOString(),
    store: { name: 'My Store' },
    data,
  };

  // 1. Installed plugins (data-only): enabled + declared the hook + configured URL.
  try {
    const installed = await listEnabledInstalledPlugins();
    for (const plugin of installed) {
      if (!plugin.manifest.hooks.includes(event)) continue;
      const url = plugin.config.url;
      if (typeof url !== 'string' || !url.trim()) {
        outcomes.push({ pluginId: plugin.id, kind: 'webhook', error: 'no url configured' });
        await appendExecLog(plugin.id, { event, eventId, ok: false, error: 'no url configured', status: null, durationMs: null });
        continue;
      }
      const secret = typeof plugin.config.secret === 'string' ? plugin.config.secret : undefined;
      const timeoutMs = typeof plugin.config.timeoutMs === 'number' ? plugin.config.timeoutMs : undefined;
      const result: WebhookResult = await dispatchWebhook(
        { url, secret, timeoutMs },
        { ...envelope, pluginId: plugin.id }
      );
      await appendExecLog(plugin.id, {
        event,
        eventId,
        ok: result.delivered,
        status: result.status ?? null,
        error: result.error ?? null,
        durationMs: result.durationMs,
      });
      outcomes.push({ pluginId: plugin.id, kind: 'webhook', delivered: result.delivered, status: result.status, error: result.error });
    }
  } catch (err) {
    logger.error(`[plugins] installed-plugin fan-out failed: ${(err as Error)?.message}`);
  }

  // 2. Bundled code handlers.
  for (const [id, handlers] of codeHandlers) {
    const fn = handlers[HOOK_METHODS[event]];
    if (typeof fn !== 'function') continue;
    try {
      await fn(envelope.data, { eventId, envelope });
      outcomes.push({ pluginId: id, kind: 'code', delivered: true });
    } catch (err) {
      logger.error(`[plugins] bundled handler "${id}" failed for ${event}: ${(err as Error)?.message}`);
      outcomes.push({ pluginId: id, kind: 'code', delivered: false, error: (err as Error)?.message });
      await appendExecLog(id, { event, eventId, ok: false, error: (err as Error)?.message, status: null, durationMs: null });
    }
  }

  return outcomes;
}
