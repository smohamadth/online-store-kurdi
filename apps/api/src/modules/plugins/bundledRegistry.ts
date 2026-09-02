// ---------------------------------------------------------------------------
// Bundled plugin registry — the static import map for in-process plugins.
//
// Bundled plugins live in `bundled/<id>/` and are wired here at module load
// (the same "static map, typo = build error" pattern as themeSections.tsx).
// They can implement any hook with real code — this is the ONLY code that
// runs from a plugin, and it is reviewed with the platform. Installed
// (uploaded) plugins are data-only and can never reach this map.
// ---------------------------------------------------------------------------
import { orderLogger } from './bundled/order-logger';
import type { HookMethod } from './plugin.schema';

export interface HandlerCtx {
  eventId: string;
  envelope: unknown;
}

export type HandlerFn = (payload: unknown, ctx: HandlerCtx) => Promise<void> | void;

/** Handlers a bundled code plugin may implement (keyed by handler method). */
export type PluginHandlers = {
  id: string;
} & Partial<Record<HookMethod, HandlerFn>>;

const BUNDLED_PLUGINS: PluginHandlers[] = [
  // The platform's example bundled plugin: logs every order/payment event
  // through the server logger. Add new bundled plugins to this list.
  orderLogger,
];

export function listBundledPluginIds(): string[] {
  return BUNDLED_PLUGINS.map((p) => p.id);
}

export function isBundledPluginId(id: string): boolean {
  return BUNDLED_PLUGINS.some((p) => p.id === id);
}

export function getBundledPlugin(id: string): PluginHandlers | undefined {
  return BUNDLED_PLUGINS.find((p) => p.id === id);
}

export { BUNDLED_PLUGINS };
