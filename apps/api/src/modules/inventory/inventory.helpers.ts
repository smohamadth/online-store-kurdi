/**
 * Pure helpers for the inventory module.
 *
 * The functions here have no I/O and no prisma dependency. They are
 * extracted from inventory.service.ts so that:
 *   - the CSV parser can be unit-tested without a database
 *   - the webhook signature check can be unit-tested with a fixed
 *     mock secret and a known body
 *   - helpers can be reused from other modules without dragging the
 *     entire inventory service into a fresh bundle
 */
import crypto from 'crypto';

// ---------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------

/**
 * Verify an HMAC-SHA256 webhook signature.
 *
 * Format: caller sends a hex digest in the X-Signature header,
 * computed with the shared secret over the raw request body. The
 * production check uses crypto.timingSafeEqual to defeat timing
 * attacks; tests can short-circuit by passing the `mockAccept` flag
 * when the production crypto module is unavailable.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  signature: string,
  opts: { mockAccept?: boolean } = {}
): boolean {
  if (!signature) return false;
  // `mockAccept` short-circuits the HMAC and accepts any non-empty signature.
  // It exists for unit tests only. It is ignored when NODE_ENV=production so
  // that a future caller wiring it to an ambient default (as the 3PL webhook
  // route once did with `NODE_ENV !== 'production'`) cannot silently disable
  // webhook authentication on a real deployment.
  // env-default-ok: this is the fail-CLOSED direction. The ambient default
  // ('development') cannot switch the hatch ON by itself - the caller must
  // also pass mockAccept, which only unit tests do.
  if (opts.mockAccept && process.env.NODE_ENV !== 'production') {
    return signature.length > 0;
  }
  if (!secret || !body) return false;
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  // timingSafeEqual requires equal-length buffers.
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------

export interface ParsedInventoryRow {
  sku: string;
  variantSku?: string;
  quantity: number;
  lineNo: number;
}

export interface InvalidInventoryRow {
  raw: string;
  error: string;
  lineNo: number;
}

export interface ParseResult {
  valid: ParsedInventoryRow[];
  invalid: InvalidInventoryRow[];
}

/**
 * Parse a CSV body into rows. Each row is:
 *   sku,quantity[,variantSku]
 * where quantity is an integer (positive = set absolute, negative = delta).
 *
 * Two-pass: we don't try to resolve SKUs at this point; the route
 * does that in a second pass. We just validate the structural
 * shape and the integer-ness of the quantity.
 */
export function parseInventoryCsv(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const valid: ParsedInventoryRow[] = [];
  const invalid: InvalidInventoryRow[] = [];
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const cols = raw.split(',').map((c) => c.trim());
    if (cols.length < 2) {
      invalid.push({ raw, error: 'expected at least 2 columns', lineNo });
      return;
    }
    const [sku, qtyStr, variantSku] = cols;
    if (!sku) {
      invalid.push({ raw, error: 'sku is required', lineNo });
      return;
    }
    const q = Number(qtyStr);
    if (!Number.isFinite(q) || !Number.isInteger(q)) {
      invalid.push({ raw, error: `quantity "${qtyStr}" is not an integer`, lineNo });
      return;
    }
    valid.push({
      sku,
      variantSku: variantSku || undefined,
      quantity: q,
      lineNo,
    });
  });
  return { valid, invalid };
}
