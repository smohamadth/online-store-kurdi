// ---------------------------------------------------------------------------
// Webhook dispatcher — delivers a plugin event envelope to a configured
// URL with an HMAC-SHA256 signature.
//
// Installed plugins are data-only; this is the only "action" they can take.
// The dispatcher is defensive by construction: http(s) URLs only, timeout
// cap, no redirect following beyond the default, signature header so a
// receiver can verify the payload came from this store.
// ---------------------------------------------------------------------------
import crypto from 'crypto';
import { logger } from '../../utils/logger';

export interface WebhookTarget {
  /** http(s) URL. */
  url: string;
  /** Optional HMAC-SHA256 signing secret. */
  secret?: string;
  /** Timeout in ms (default 5000, cap 30000). */
  timeoutMs?: number;
}

export interface WebhookResult {
  delivered: boolean;
  status?: number;
  error?: string;
  durationMs: number;
}

export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSignature(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Deliver one event envelope. Never throws: failures are returned in the
 * result so the caller can log them without breaking the storefront.
 */
export async function dispatchWebhook(target: WebhookTarget, envelope: unknown): Promise<WebhookResult> {
  const started = Date.now();
  const timeoutMs = Math.min(Math.max(target.timeoutMs ?? 5000, 100), 30_000);
  const body = JSON.stringify(envelope);
  const url = target.url;

  if (!isValidWebhookUrl(url)) {
    return { delivered: false, error: `Invalid webhook URL (must be http/https): "${url}"`, durationMs: Date.now() - started };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'store-builder-webhook/1.0',
      'X-Store-Webhook-Id': crypto.randomUUID(),
    };
    if (target.secret) {
      headers['X-Store-Webhook-Signature'] = `sha256=${buildSignature(target.secret, body)}`;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const ok = res.ok;
    return { delivered: ok, status: res.status, durationMs: Date.now() - started };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.warn(`[plugins] webhook delivery failed (${aborted ? 'timeout' : 'error'}): ${url} — ${(err as Error)?.message}`);
    return {
      delivered: false,
      error: aborted ? `Timed out after ${timeoutMs}ms` : (err as Error)?.message ?? 'Delivery failed',
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
