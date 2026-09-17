import { describe, it, expect, vi } from 'vitest';
import { parseHomeVersions, pushHomeVersion, HOME_HISTORY_CAP, recordHomeVersion, loadHomeVersions } from './homeHistory';
import type { HomeSection } from '@/lib/homeSections';

const row = (id: string): HomeSection => ({
  id,
  key: id,
  type: 'hero',
  title: null,
  subtitle: null,
  isVisible: true,
  sortOrder: 1,
  config: {},
});

describe('homeHistory', () => {
  it('parses a stored list and ignores junk', () => {
    expect(parseHomeVersions(null)).toEqual([]);
    expect(parseHomeVersions('not-json')).toEqual([]);
    const ok = parseHomeVersions(JSON.stringify([{ id: 'a', at: 't', sections: [] }]));
    expect(ok).toHaveLength(1);
  });

  it('does not turn a successful API save into an error when optional browser storage fails', () => {
    const read = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    const write = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    try {
      expect(loadHomeVersions()).toEqual([]);
      expect(recordHomeVersion([row('saved')])[0].sections[0].id).toBe('saved');
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it('prepends snapshots and caps length', () => {
    let list = pushHomeVersion([], [row('1')], new Date('2026-01-01T00:00:00Z'));
    expect(list[0].sections[0].id).toBe('1');
    for (let i = 0; i < HOME_HISTORY_CAP + 5; i++) {
      list = pushHomeVersion(list, [row(String(i))]);
    }
    expect(list).toHaveLength(HOME_HISTORY_CAP);
  });
});
