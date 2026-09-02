// Example-code generators for the developer reference.
//
// Given a manifest entry (the same shape served by GET /api/developers),
// these pure functions produce copy-paste snippets in three languages.
// Values are derived from the endpoint's own documentation:
//   - `:path` segments become the documented enum value when there is
//     one (e.g. menus/location/:location -> header), else a placeholder.
//   - query/body params are rendered from a small defaults table for
//     common names (email, code, country...), enum first-values, and
//     required params; noisy optional params without a sensible default
//     are omitted so the examples stay readable.
//   - customer-scoped endpoints get an Authorization header.

export interface ExampleParam {
  name: string;
  type?: string;
  values?: string[];
  optional?: boolean;
  description?: string;
}

export interface ExampleEndpoint {
  method: string;
  path: string;
  auth: 'none' | 'optional' | 'customer';
  params?: ExampleParam[];
}

/** Docs base URL — examples are written against the public domain form. */
export const EXAMPLE_BASE = 'https://your-store.example';

/** Sensible demo values for the parameter names developers actually use. */
const DEFAULTS: Record<string, string> = {
  email: 'customer@example.com',
  password: 'your-password',
  refreshToken: '<refresh-token>',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+1 555 0100',
  code: 'SAVE10',
  subtotal: '120',
  country: 'US',
  state: 'CA',
  zipCode: '90001',
  weight: '2',
  itemCount: '3',
  q: 'summer',
  limit: '10',
  page: '1',
  category: 'clothing',
  type: 'physical',
  position: 'hero',
  location: 'header',
  idOrSlug: '<category-id-or-slug>',
  optionValueId: '<option-value-id>',
  productId: '<product-id>',
  variantId: '<variant-id>',
  slug: '<slug>',
  token: '<download-token>',
};

function valueFor(param: ExampleParam): string | null {
  if (param.values && param.values.length > 0) return param.values[0];
  const fromTable = DEFAULTS[param.name.toLowerCase()];
  if (fromTable !== undefined) return fromTable;
  return param.optional ? null : 'value';
}

interface Resolved {
  /** Path with :segments replaced (ready to append to the base URL). */
  urlPath: string;
  /** Query params for GETs. */
  query: Array<[string, string]>;
  /** Body params for POSTs. */
  body: Array<[string, string]>;
}

function resolve(entry: ExampleEndpoint): Resolved {
  const params = entry.params ?? [];
  const byName = new Map(params.map((p) => [p.name, p]));
  const pathNames = new Set(
    Array.from(entry.path.matchAll(/:([a-zA-Z]+)/g), (m) => m[1])
  );
  const query: Array<[string, string]> = [];
  const body: Array<[string, string]> = [];
  const urlPath = entry.path.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
    const p = byName.get(name);
    const v = p ? valueFor(p) : null;
    return v ?? `<${name}>`;
  });
  for (const p of params) {
    if (pathNames.has(p.name)) continue;
    const v = valueFor(p);
    if (v === null) continue;
    const pair: [string, string] = [p.name, v];
    if (entry.method === 'GET') query.push(pair);
    else body.push(pair);
  }
  return { urlPath, query, body };
}

function toUrl(resolved: Resolved): string {
  return resolved.query.length
    ? `${EXAMPLE_BASE}${resolved.urlPath}?${resolved.query
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&')}`
    : `${EXAMPLE_BASE}${resolved.urlPath}`;
}

/** cURL snippet. */
export function buildCurl(entry: ExampleEndpoint): string {
  const resolved = resolve(entry);
  const url = toUrl(resolved);
  const lines: string[] = [];
  if (entry.method !== 'GET') {
    lines.push(`curl -X ${entry.method} "${url}" \\`);
    lines.push(`  -H 'content-type: application/json' \\`);
    if (entry.auth === 'customer') {
      lines.push(`  -H "Authorization: Bearer $ACCESS_TOKEN" \\`);
    }
    lines.push(
      `  -d '${JSON.stringify(Object.fromEntries(resolved.body))}'`
    );
  } else {
    lines.push(`curl "${url}"`);
    if (entry.auth === 'customer') {
      lines.push(`  -H "Authorization: Bearer $ACCESS_TOKEN"`);
    } else if (entry.auth === 'optional') {
      lines.push(
        `# optional: add -H "Authorization: Bearer $ACCESS_TOKEN" to scope to a customer`
      );
    }
  }
  return lines.join('\n');
}

/** JavaScript fetch snippet (returns the unwrapped `data`). */
export function buildFetch(entry: ExampleEndpoint): string {
  const resolved = resolve(entry);
  const url = toUrl(resolved);
  const isPost = entry.method === 'POST';
  const lines: string[] = [];
  lines.push(`const res = await fetch("${url}", {`);
  if (entry.method !== 'GET') lines.push(`  method: "${entry.method}",`);
  lines.push(`  headers: {`);
  if (isPost) lines.push(`    "content-type": "application/json",`);
  if (entry.auth === 'customer') {
    lines.push(`    authorization: \`Bearer \${ACCESS_TOKEN}\`,`);
  }
  lines.push(`  },`);
  if (isPost) {
    lines.push(
      `  body: JSON.stringify(${JSON.stringify(Object.fromEntries(resolved.body))}),`
    );
  }
  lines.push(`});`);
  lines.push(`const { data } = await res.json();`);
  if (entry.auth === 'optional') {
    lines.push(
      `// optional: add authorization: \`Bearer \${ACCESS_TOKEN}\` to scope to a customer`
    );
  }
  return lines.join('\n');
}

/** Python snippet (requests). */
export function buildPython(entry: ExampleEndpoint): string {
  const resolved = resolve(entry);
  const url = `${EXAMPLE_BASE}${resolved.urlPath}`;
  const isPost = entry.method === 'POST';
  const lines: string[] = [];
  const headersArg =
    entry.auth === 'customer'
      ? `, headers={"authorization": f"Bearer {ACCESS_TOKEN}"}`
      : '';
  if (isPost) {
    lines.push(`import requests`);
    lines.push(``);
    lines.push(`res = requests.post(`);
    lines.push(`    "${url}",`);
    lines.push(`    json=${JSON.stringify(Object.fromEntries(resolved.body))}${headersArg},`);
    lines.push(`)`);
  } else if (resolved.query.length) {
    lines.push(`import requests`);
    lines.push(``);
    lines.push(`res = requests.get(`);
    lines.push(`    "${url}",`);
    lines.push(`    params=${JSON.stringify(Object.fromEntries(resolved.query))}${headersArg},`);
    lines.push(`)`);
  } else {
    lines.push(`import requests`);
    lines.push(``);
    lines.push(`res = requests.get("${url}"${headersArg})`);
  }
  if (entry.auth === 'optional') {
    lines.push(
      `# optional: pass headers={"authorization": f"Bearer {ACCESS_TOKEN}"} to scope to a customer`
    );
  }
  lines.push(`data = res.json()["data"]`);
  return lines.join('\n');
}

/** All three snippets for an endpoint, keyed for the tab UI. */
export function buildExamples(
  entry: ExampleEndpoint
): Array<{ key: string; label: string; code: string }> {
  return [
    { key: 'curl', label: 'cURL', code: buildCurl(entry) },
    { key: 'javascript', label: 'JavaScript', code: buildFetch(entry) },
    { key: 'python', label: 'Python', code: buildPython(entry) },
  ];
}
