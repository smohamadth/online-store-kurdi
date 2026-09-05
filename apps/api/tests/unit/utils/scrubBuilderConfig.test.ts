import { describe, it, expect } from 'vitest';
import { scrubBuilderConfig, scrubStudioLayouts } from '../../../src/utils/scrubBuilderConfig';

describe('scrubBuilderConfig', () => {
  it('sanitises html, faq answers, quotes, and lookbook copy', () => {
    const out = scrubBuilderConfig({
      html: '<p>ok<script>x()</script></p>',
      quote: '<img src=x onerror=alert(1)>hi',
      description: '<p>look<script>x()</script></p>',
      items: [{ q: 'Why?', a: '<b>because</b><script>x()</script>' }],
    });
    expect(String(out.html)).not.toContain('<script>');
    expect(String(out.quote)).not.toMatch(/onerror/i);
    expect(String(out.description)).not.toContain('<script>');
    const items = out.items as { a: string }[];
    expect(items[0].a).toContain('<b>because</b>');
    expect(items[0].a).not.toContain('<script>');
  });

  it('blanks javascript: and data: hrefs/src', () => {
    const out = scrubBuilderConfig({
      linkUrl: 'javascript:alert(1)',
      buttonHref: '/deals',
      image: 'data:text/html,<script>x()</script>',
      poster: 'https://cdn.example.com/p.jpg',
      url: 'javascript:void(0)',
      items: [{ linkUrl: 'javascript:alert(1)', image: '/uploads/a.jpg' }],
    });
    expect(out.linkUrl).toBe('');
    expect(out.buttonHref).toBe('/deals');
    expect(out.image).toBe('');
    expect(out.poster).toBe('https://cdn.example.com/p.jpg');
    expect(out.url).toBe('');
    const items = out.items as { linkUrl: string; image: string }[];
    expect(items[0].linkUrl).toBe('');
    expect(items[0].image).toBe('/uploads/a.jpg');
  });

  it('caps list length', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ title: String(i) }));
    const out = scrubBuilderConfig({ items });
    expect((out.items as unknown[]).length).toBe(40);
  });

  it('sanitises comparison cell values', () => {
    const out = scrubBuilderConfig({
      values: ['true', '<img src=x onerror=alert(1)>'],
    });
    const values = out.values as string[];
    expect(values[0]).toBe('true');
    expect(values[1]).not.toMatch(/onerror/i);
  });
});

describe('scrubStudioLayouts', () => {
  it('scrubs each block config', () => {
    const layouts = scrubStudioLayouts({
      home: {
        columns: 12,
        blocks: [
          { id: 'c', type: 'cta', config: { buttonHref: 'javascript:alert(1)', html: '<p>x<script>y()</script></p>' } },
        ],
      },
    });
    const home = layouts!.home as { blocks: { config: Record<string, string> }[] };
    expect(home.blocks[0].config.buttonHref).toBe('');
    expect(home.blocks[0].config.html).not.toContain('<script>');
  });
});
