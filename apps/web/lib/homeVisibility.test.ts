import { describe, it, expect } from 'vitest';
import { isHomeSectionVisible } from './homeVisibility';

describe('isHomeSectionVisible', () => {
  it('follows the Home builder row, not theme.show* tokens', () => {
    expect(isHomeSectionVisible({ isVisible: true })).toBe(true);
    expect(isHomeSectionVisible({ isVisible: false })).toBe(false);
  });
});
