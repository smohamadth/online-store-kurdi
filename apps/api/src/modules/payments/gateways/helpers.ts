// ---------------------------------------------------------------------------
// Shared HTTP helpers for the payment gateways.
//
// `fetchJson` is the single place every gateway does a network call. It is
// injectable (`deps.fetch`) so unit tests can stub the network without ever
// reaching a live gateway. Non-2xx responses are surfaced as a typed error
// with the gateway's own body attached, so a bad key produces a clear
// message ("401 from Zarinpal: ...") instead of a generic failure.
// ---------------------------------------------------------------------------

export interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface GatewayHttp {
  fetch: FetchLike;
}

export class GatewayHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'GatewayHttpError';
    this.status = status;
    this.body = body;
  }
}

/**
 * POST JSON and parse the response as JSON. Returns `null` when the response
 * body is not JSON (some gateways return empty/plain bodies on success).
 */
export async function postJson(
  deps: GatewayHttp,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await deps.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    throw new GatewayHttpError(res.status, `${res.status} from gateway`, json ?? text);
  }
  return json;
}

/** POST an already-encoded body (e.g. application/x-www-form-urlencoded). */
export async function postForm(
  deps: GatewayHttp,
  url: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await deps.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    throw new GatewayHttpError(res.status, `${res.status} from gateway`, json ?? text);
  }
  return json;
}

/** GET and parse JSON. */
export async function getJson(
  deps: GatewayHttp,
  url: string,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await deps.fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    throw new GatewayHttpError(res.status, `${res.status} from gateway`, json ?? text);
  }
  return json;
}

/** Format an amount as a 2-decimal string ("1234.50") for string-amount gateways. */
export function formatAmount2(amount: number): string {
  return amount.toFixed(2);
}

/** Round an amount to a whole integer (Iranian Rial / IQD amounts). */
export function roundAmount(amount: number): number {
  return Math.round(amount);
}

export const defaultHttp: GatewayHttp = { fetch: (...a) => fetch(...a) };
