import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@/lib/theme';
import { THEMES } from '@/lib/themeRegistry';
import { mergePickedTheme, pickedTokensToTheme } from '@/lib/mergePickedTheme';

describe('mergePickedTheme', () => {
  it('picked tokens win over the current theme (not the inverse)', () => {
    const bold = THEMES.find((t) => t.key === 'bold')!;
    const current = {
      ...DEFAULT_THEME,
      primaryColor: '#111111',
      bodyBg: '#ffffff',
      announcementText: 'Keep me',
      customCss: '.x{color:red}',
      showAnnouncement: true,
    };
    const next = mergePickedTheme(current, bold);
    expect(next.primaryColor).toBe(bold.tokens.primaryColor);
    expect(next.bodyBg).toBe(bold.tokens.bodyBg);
    expect(next.activeTheme).toBe('bold');
    expect(next.announcementText).toBe('Keep me');
    expect(next.customCss).toBe('.x{color:red}');
    expect(next.showAnnouncement).toBe(true);
  });

  it('pickedTokensToTheme sets activeTheme from the config key', () => {
    const pulse = THEMES.find((t) => t.key === 'pulse')!;
    expect(pickedTokensToTheme(pulse).activeTheme).toBe('pulse');
  });
});
