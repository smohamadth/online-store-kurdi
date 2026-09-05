import { describe, it, expect } from 'vitest';
import { parseHomePreviewDraft } from './homePreviewDraft';

describe('parseHomePreviewDraft', () => {
  it('rejects empty or junk payloads', () => {
    expect(parseHomePreviewDraft(null)).toBeNull();
    expect(parseHomePreviewDraft('[]')).toBeNull();
    expect(parseHomePreviewDraft('not-json')).toBeNull();
    expect(parseHomePreviewDraft(JSON.stringify([{ id: 1 }]))).toBeNull();
  });

  it('accepts a HomeSection-shaped list', () => {
    const rows = [{ id: 'h', key: 'hero', type: 'hero', title: 'Hi', subtitle: null, isVisible: true, sortOrder: 1, config: {} }];
    expect(parseHomePreviewDraft(JSON.stringify(rows))?.[0].title).toBe('Hi');
  });
});
