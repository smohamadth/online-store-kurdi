/**
 * Admin-panel locale (independent of the storefront language).
 *
 * Stored in localStorage `adminLanguage`. English / Persian / Sorani Kurdish.
 * Sorani terms follow Kurdish e-commerce usage (بەرهەم، داواکاری، کۆگا، گەیاندن)
 * rather than Arabic calques.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

export const ADMIN_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr' as const },
  { code: 'fa', name: 'Persian', native: 'فارسی', dir: 'rtl' as const },
  { code: 'ku', name: 'Kurdish (Sorani)', native: 'کوردی (سۆرانی)', dir: 'rtl' as const },
] as const;

export type AdminLang = (typeof ADMIN_LANGUAGES)[number]['code'];

const STORAGE_KEY = 'adminLanguage';

const en: Record<string, string> = {
  'admin.brand': 'Admin Panel',
  'admin.subtitle': 'Online Store Management',
  'admin.welcome': 'Welcome, {name}',
  'admin.viewStore': 'View Store',
  'admin.logout': 'Logout',
  'admin.loading': 'Loading admin panel...',
  'nav.dashboard': 'Dashboard',
  'nav.catalogue': 'Catalogue',
  'nav.products': 'Products',
  'nav.variants': 'Variants',
  'nav.categories': 'Categories',
  'nav.inventory': 'Inventory',
  'nav.importExport': 'Import / Export',
  'nav.selling': 'Selling',
  'nav.orders': 'Orders',
  'nav.coupons': 'Coupons',
  'nav.giftCards': 'Gift cards',
  'nav.affiliates': 'Affiliates',
  'nav.shipping': 'Shipping',
  'nav.tax': 'Tax',
  'nav.finance': 'Finance',
  'nav.accounting': 'Accounting',
  'nav.payments': 'Payment Gateways',
  'nav.customers': 'Customers',
  'nav.users': 'Users',
  'nav.reviews': 'Reviews',
  'nav.newsletter': 'Newsletter',
  'nav.contact': 'Contact inbox',
  'nav.currencies': 'Currencies',
  'nav.storefront': 'Storefront',
  'nav.pages': 'Pages',
  'nav.blog': 'Blog',
  'nav.appearance': 'Appearance',
  'nav.themeStudio': 'Theme Studio',
  'nav.plugins': 'Plugins',
  'nav.banners': 'Gallery & Banners',
  'nav.menus': 'Menus',
  'nav.system': 'System',
  'nav.analytics': 'Analytics',
  'nav.settings': 'Store Settings',
  'nav.profile': 'My Profile',
  'nav.languages': 'Languages',
  'lang.panel': 'Admin language',
};

const fa: Record<string, string> = {
  'admin.brand': 'پنل مدیریت',
  'admin.subtitle': 'مدیریت فروشگاه آنلاین',
  'admin.welcome': 'خوش آمدید، {name}',
  'admin.viewStore': 'مشاهده فروشگاه',
  'admin.logout': 'خروج',
  'admin.loading': 'در حال بارگذاری پنل مدیریت...',
  'nav.dashboard': 'داشبورد',
  'nav.catalogue': 'کاتالوگ',
  'nav.products': 'محصولات',
  'nav.variants': 'گونه‌ها',
  'nav.categories': 'دسته‌بندی‌ها',
  'nav.inventory': 'موجودی',
  'nav.importExport': 'درون‌ریزی / برون‌بری',
  'nav.selling': 'فروش',
  'nav.orders': 'سفارش‌ها',
  'nav.coupons': 'کوپن‌ها',
  'nav.giftCards': 'کارت هدیه',
  'nav.affiliates': 'همکاران فروش',
  'nav.shipping': 'ارسال',
  'nav.tax': 'مالیات',
  'nav.finance': 'مالی',
  'nav.accounting': 'حسابداری',
  'nav.payments': 'درگاه‌های پرداخت',
  'nav.customers': 'مشتریان',
  'nav.users': 'کاربران',
  'nav.reviews': 'نظرات',
  'nav.newsletter': 'خبرنامه',
  'nav.contact': 'صندوق تماس',
  'nav.currencies': 'ارزها',
  'nav.storefront': 'ویترین فروشگاه',
  'nav.pages': 'صفحات',
  'nav.blog': 'وبلاگ',
  'nav.appearance': 'ظاهر',
  'nav.themeStudio': 'استودیوی قالب',
  'nav.plugins': 'افزونه‌ها',
  'nav.banners': 'گالری و بنرها',
  'nav.menus': 'منوها',
  'nav.system': 'سیستم',
  'nav.analytics': 'آمار',
  'nav.settings': 'تنظیمات فروشگاه',
  'nav.profile': 'پروفایل من',
  'nav.languages': 'زبان‌ها',
  'lang.panel': 'زبان پنل مدیریت',
};

/** Central Kurdish (Sorani) — Arabic script, Kurdistan Region IT usage. */
const ku: Record<string, string> = {
  'admin.brand': 'پانێڵی بەڕێوەبەر',
  'admin.subtitle': 'بەڕێوەبردنی فرۆشگای ئۆنلاین',
  'admin.welcome': 'بەخێربێیت، {name}',
  'admin.viewStore': 'بینینی فرۆشگا',
  'admin.logout': 'دەرچوون',
  'admin.loading': 'پانێڵی بەڕێوەبەر باردەکرێت...',
  'nav.dashboard': 'تابلۆی سەرەکی',
  'nav.catalogue': 'کاتالۆگ',
  'nav.products': 'بەرهەمەکان',
  'nav.variants': 'جۆرەکان',
  'nav.categories': 'پۆلەکان',
  'nav.inventory': 'کۆگا',
  'nav.importExport': 'هاوردە / هەناردە',
  'nav.selling': 'فرۆشتن',
  'nav.orders': 'داواکارییەکان',
  'nav.coupons': 'کوپۆنەکان',
  'nav.giftCards': 'کارتی دیاری',
  'nav.affiliates': 'هاوبەشەکانی فرۆشتن',
  'nav.shipping': 'گەیاندن',
  'nav.tax': 'باج',
  'nav.finance': 'دارایی',
  'nav.accounting': 'ژمێریاری',
  'nav.payments': 'دەروازەکانی پارەدان',
  'nav.customers': 'کڕیاران',
  'nav.users': 'بەکارهێنەران',
  'nav.reviews': 'پێداچوونەوەکان',
  'nav.newsletter': 'هەواڵنامە',
  'nav.contact': 'نامەکانی پەیوەندی',
  'nav.currencies': 'دراوەکان',
  'nav.storefront': 'ڕووی فرۆشگا',
  'nav.pages': 'پەڕەکان',
  'nav.blog': 'بلۆگ',
  'nav.appearance': 'ڕووکار',
  'nav.themeStudio': 'ستۆدیۆی ڕووکار',
  'nav.plugins': 'پێوەکراوەکان',
  'nav.banners': 'گالەری و بانەرەکان',
  'nav.menus': 'مێنیووەکان',
  'nav.system': 'سیستەم',
  'nav.analytics': 'شیکاری',
  'nav.settings': 'ڕێکخستنەکانی فرۆشگا',
  'nav.profile': 'پرۆفایلی من',
  'nav.languages': 'زمانەکان',
  'lang.panel': 'زمانی پانێڵی بەڕێوەبەر',
};

export const adminDictionaries: Record<string, Record<string, string>> = { en, fa, ku };

export function readAdminLanguage(): AdminLang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && adminDictionaries[saved]) return saved as AdminLang;
  } catch { /* ignore */ }
  return 'en';
}

export function adminT(lang: string, key: string, vars?: Record<string, string>): string {
  let s = adminDictionaries[lang]?.[key] || adminDictionaries.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  }
  return s;
}

export function useAdminI18n() {
  const [language, setLanguage] = useState<AdminLang>('en');

  useEffect(() => {
    const sync = () => setLanguage(readAdminLanguage());
    sync();
    window.addEventListener('adminLanguageChange', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('adminLanguageChange', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const changeLanguage = useCallback((code: string) => {
    const next = (adminDictionaries[code] ? code : 'en') as AdminLang;
    setLanguage(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    window.dispatchEvent(new Event('adminLanguageChange'));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => adminT(language, key, vars),
    [language],
  );

  const dir = ADMIN_LANGUAGES.find((l) => l.code === language)?.dir ?? 'ltr';
  return { t, language, dir, changeLanguage, languages: ADMIN_LANGUAGES };
}
