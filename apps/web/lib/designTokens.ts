/** Shared colour labels for the live appearance editor and reusable theme designer. */
import type { Theme } from './theme';

export const DESIGN_COLOR_FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'primaryColor', label: 'Primary / buttons', hint: 'Buttons, active states, brand accents' },
  { key: 'primaryTextColor', label: 'Text on primary', hint: 'Label colour inside primary buttons' },
  { key: 'accentColor', label: 'Accent', hint: 'Links and highlights' },
  { key: 'bodyBg', label: 'Page background', hint: 'Main background of every page' },
  { key: 'cardBg', label: 'Card / panel background', hint: 'Product cards, forms, summary boxes' },
  { key: 'bodyText', label: 'Body text', hint: 'Default text colour' },
  { key: 'mutedText', label: 'Muted text', hint: 'Captions, secondary labels' },
  { key: 'borderColor', label: 'Borders', hint: 'Card and input outlines' },
  { key: 'headerBg', label: 'Header background', hint: 'Top navigation bar' },
  { key: 'headerText', label: 'Header text', hint: 'Navigation links' },
  { key: 'footerBg', label: 'Footer background', hint: '' },
  { key: 'footerText', label: 'Footer text', hint: '' },
  { key: 'priceColor', label: 'Price', hint: 'Product price colour' },
  { key: 'saleColor', label: 'Sale / discount', hint: 'Discount badges' },
];

export const ANNOUNCEMENT_COLOR_FIELDS = [
  { key: 'announcementBg', label: 'Announcement background' },
  { key: 'announcementText2', label: 'Announcement text colour' },
] as const;
