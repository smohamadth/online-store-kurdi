/**
 * Log redaction.
 *
 * Logs go to shippers, backups and support tickets - far more readable than
 * the database, and retained far longer. A credential in a log line is a
 * credential handed out broadly.
 *
 * The concrete leak: the newsletter unsubscribe token travels in the query
 * string (it must - it is a one-click link in an email), and both morgan's
 * access log and the error handler wrote req.url verbatim.
 */
import { describe, it, expect } from 'vitest';
import {
  redactUrl, redactLogLine, truncateIp, SENSITIVE_PARAMS, REDACTED,
} from '../../../src/utils/redact';

describe('redactUrl', () => {
  it('redacts the unsubscribe token that started this', () => {
    const url = `/api/newsletter/unsubscribe?token=${'a'.repeat(64)}`;
    const out = redactUrl(url);
    expect(out).toBe(`/api/newsletter/unsubscribe?token=${REDACTED}`);
    expect(out).not.toContain('aaaa');
  });

  it('keeps the parameter NAME so the log still shows what was supplied', () => {
    // Dropping the name entirely would make debugging harder for no gain -
    // the name is not the secret.
    expect(redactUrl('/x?token=abc')).toContain('token=');
  });

  it('leaves a URL with no query string untouched', () => {
    expect(redactUrl('/api/products/widget')).toBe('/api/products/widget');
  });

  it('leaves non-sensitive parameters readable', () => {
    // Over-redacting makes access logs useless for diagnosing traffic.
    expect(redactUrl('/api/products?page=2&limit=50&sort=price'))
      .toBe('/api/products?page=2&limit=50&sort=price');
  });

  it('redacts only the sensitive parameter in a mixed query', () => {
    expect(redactUrl('/api/x?page=2&token=secret&sort=asc'))
      .toBe(`/api/x?page=2&token=${REDACTED}&sort=asc`);
  });

  it.each([...SENSITIVE_PARAMS])('redacts %s', (param) => {
    const out = redactUrl(`/api/x?${param}=supersecretvalue`);
    expect(out).not.toContain('supersecretvalue');
    expect(out).toContain(REDACTED);
  });

  it('is case-insensitive on the parameter name', () => {
    // ?Token= and ?TOKEN= leak exactly as much as ?token=.
    for (const p of ['Token', 'TOKEN', 'ToKeN']) {
      expect(redactUrl(`/x?${p}=leak`)).not.toContain('leak');
    }
  });

  it('redacts every occurrence when a parameter repeats', () => {
    const out = redactUrl('/x?token=one&token=two');
    expect(out).not.toContain('one');
    expect(out).not.toContain('two');
  });

  it('handles an absolute URL', () => {
    expect(redactUrl('https://shop.example/api/x?token=abc'))
      .toBe(`https://shop.example/api/x?token=${REDACTED}`);
  });

  it('preserves a fragment without leaking through it', () => {
    expect(redactUrl('/x?token=abc#section')).toBe(`/x?token=${REDACTED}#section`);
  });

  it('leaves a bare flag alone - there is no value to leak', () => {
    expect(redactUrl('/x?debug')).toBe('/x?debug');
  });

  it('handles an empty query string', () => {
    expect(redactUrl('/x?')).toBe('/x?');
  });

  it('redacts a URL-encoded parameter name', () => {
    // ?%74oken= decodes to ?token= and would otherwise slip through.
    expect(redactUrl('/x?%74oken=leak')).not.toContain('leak');
  });

  it.each([[''], [null], [undefined]])('tolerates %j without throwing', (bad) => {
    expect(() => redactUrl(bad as any)).not.toThrow();
  });

  it('does not mangle a value containing = or &-escapes', () => {
    expect(redactUrl('/x?filter=a%3Db&page=1')).toBe('/x?filter=a%3Db&page=1');
  });
});

describe('redactLogLine', () => {
  it('redacts a token inside a combined access-log line', () => {
    // morgan hands the whole request line to the stream as one string.
    const line = `1.2.3.4 - - [01/Jan/2026] "GET /api/newsletter/unsubscribe?token=${'b'.repeat(64)} HTTP/1.1" 200 15`;
    const out = redactLogLine(line);
    expect(out).not.toContain('bbbb');
    expect(out).toContain(REDACTED);
    // The rest of the line survives, or the access log loses its value.
    expect(out).toContain('200 15');
    expect(out).toContain('GET');
  });

  it('leaves a line with no query string untouched', () => {
    const line = '1.2.3.4 - - [01/Jan/2026] "GET /api/products HTTP/1.1" 200 15';
    expect(redactLogLine(line)).toBe(line);
  });

  it('keeps ordinary query parameters readable', () => {
    const line = '"GET /api/products?page=2 HTTP/1.1" 200';
    expect(redactLogLine(line)).toContain('page=2');
  });

  it('handles the dev-format line shape too', () => {
    const out = redactLogLine('GET /api/x?token=zzz 200 4.2 ms - 15');
    expect(out).not.toContain('zzz');
    expect(out).toContain('200');
  });

  it.each([[''], [null], [undefined]])('tolerates %j', (bad) => {
    expect(() => redactLogLine(bad as any)).not.toThrow();
  });
});

describe('truncateIp', () => {
  it('drops the last IPv4 octet', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0');
  });

  it('unwraps an IPv4-mapped IPv6 address first', () => {
    expect(truncateIp('::ffff:198.51.100.7')).toBe('198.51.100.0');
  });

  it('keeps only the first three IPv6 groups', () => {
    expect(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
  });

  it('never returns the identifying final octet', () => {
    expect(truncateIp('192.168.1.99')).not.toContain('99');
  });

  it.each([[null], [undefined], [''], ['   '], ['not-an-ip'], ['1.2.3'], ['999.1.1.1']])(
    'returns null for %j rather than storing junk',
    (bad) => {
      expect(truncateIp(bad as any)).toBeNull();
    },
  );
});

describe('no log site writes a raw request URL', () => {
  // Source ratchet. req.url carries the query string, and one-click links put
  // credentials there, so logging it unredacted reintroduces the leak. This
  // catches a new call site rather than relying on review.
  it('every logged req.url goes through redactUrl', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const SRC = resolve(__dirname, '../../../src');

    const files: string[] = [];
    (function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.includes('.test.')) files.push(full);
      }
    })(SRC);

    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        // `url: req.url` / `url: req.originalUrl` inside a log payload.
        if (!/\burl:\s*req\.(originalUrl|url)\b/.test(line)) return;
        offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${trimmed}`);
      });
    }

    expect(offenders, `log a redacted URL instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
