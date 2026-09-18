import { describe, it, expect } from 'vitest';
import { parseHomePreviewDraft, writeHomePreviewDraft, readHomePreviewDraft, clearHomePreviewDraft } from './homePreviewDraft';

describe('homePreviewDraft', () => {
  it('rejects missing/junk payloads, but accepts an intentionally empty layout', () => {
    expect(parseHomePreviewDraft(null)).toBeNull();
    expect(parseHomePreviewDraft('[]')).toEqual([]);
    expect(parseHomePreviewDraft('not-json')).toBeNull();
    expect(parseHomePreviewDraft(JSON.stringify([{ id: 1 }]))).toBeNull();
  });

  it('accepts a HomeSection-shaped list', () => {
    const rows = [{ id: 'h', key: 'hero', type: 'hero', title: 'Hi', subtitle: null, isVisible: true, sortOrder: 1, config: {} }];
    expect(parseHomePreviewDraft(JSON.stringify(rows))?.[0].title).toBe('Hi');
  });

  it('writes an empty draft instead of showing stale blocks, and removes it on exit', () => {
    writeHomePreviewDraft([]);
    expect(readHomePreviewDraft()).toEqual([]);
    clearHomePreviewDraft();
    expect(readHomePreviewDraft()).toBeNull();
  });
});
