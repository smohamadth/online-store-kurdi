/** Keys shipped with the platform. Theme Studio cannot overwrite these. */
export const PLATFORM_BUNDLED_THEME_KEYS = [
  'default',
  'bold',
  'dawnlight',
  'minimal',
  'pulse',
] as const;

export function isPlatformBundledTheme(key: string | null | undefined): boolean {
  if (!key) return false;
  return (PLATFORM_BUNDLED_THEME_KEYS as readonly string[]).includes(key);
}
