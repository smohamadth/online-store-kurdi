import { DEFAULT_THEME, type Theme } from '@/lib/theme';
import type { ThemeConfig } from '@/lib/themeRegistry';

/**
 * Flatten a ThemeConfig's tokens into a runtime Theme, then overlay
 * merchant copy that should survive a theme switch (announcement + CSS).
 *
 * Appearance used to spread the *current* theme after the picked tokens,
 * so "Use this theme" only flipped `activeTheme` and left Classic colours
 * on screen. Tokens from the picked theme must win; announcement text /
 * link / custom CSS stay as the merchant wrote them.
 */
export function pickedTokensToTheme(picked: ThemeConfig): Theme {
  const t = picked.tokens as Record<string, string | number | boolean>;
  return {
    ...DEFAULT_THEME,
    ...t,
    activeTheme: picked.key,
  } as Theme;
}

export function mergePickedTheme(current: Theme, picked: ThemeConfig): Theme {
  const tokens = pickedTokensToTheme(picked);
  return {
    ...tokens,
    announcementText: current.announcementText,
    announcementLink: current.announcementLink,
    customCss: current.customCss,
    showAnnouncement: current.showAnnouncement,
    activeTheme: picked.key,
  };
}
