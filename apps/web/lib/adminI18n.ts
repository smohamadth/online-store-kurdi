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
  'dash.apiDisconnected': 'API Disconnected',
  'dash.apiHint': 'Start API for full functionality: npm run dev:api',
  'dash.totalProducts': 'Total Products',
  'dash.totalOrders': 'Total Orders',
  'dash.categories': 'Categories',
  'dash.totalRevenue': 'Total Revenue',
  'dash.manage': 'Manage',
  'dash.viewDetails': 'View details',
  'dash.recentOrders': 'Recent Orders',
  'dash.viewAll': 'View all',
  'dash.noOrders': 'No orders yet',
  'dash.noOrdersHint': 'Orders will appear here as soon as a customer checks out.',
  'dash.addProductFirst': 'Add a product first — customers cannot order from an empty catalogue.',
  'dash.addFirstProduct': 'Add your first product',
  'dash.bestSellers': 'Best sellers',
  'dash.latestProducts': 'Latest products',
  'dash.rankedByRevenue': 'Ranked by revenue',
  'dash.noSalesYet': 'No sales yet — showing your newest products',
  'dash.noProducts': 'No products yet',
  'dash.emptyCatalogue': 'Your catalogue is empty. Add a product to start selling.',
  'dash.soldStock': '{n} sold · Stock: {stock}',
  'dash.stock': 'Stock: {stock}',
  'dash.revenue': 'revenue',
  'dash.price': 'price',
  'dash.quickActions': 'Quick Actions',
  'dash.addProduct': 'Add Product',
  'dash.manageOrders': 'Manage Orders',
  'dash.manageUsers': 'Manage Users',
  'prod.total': '{n} total products',
  'prod.add': '+ Add Product',
  'prod.search': 'Search products by name or SKU...',
  'prod.colProduct': 'Product',
  'prod.colSku': 'SKU',
  'prod.colCategory': 'Category',
  'prod.colPrice': 'Price',
  'prod.colStock': 'Stock',
  'prod.colStatus': 'Status',
  'prod.colActions': 'Actions',
  'prod.edit': 'Edit',
  'prod.delete': 'Delete',
  'prod.none': 'No products found',
  'prod.loading': 'Loading products...',
  'prod.confirmDelete': 'Are you sure you want to delete this product?',
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
  'dash.apiDisconnected': 'API قطع است',
  'dash.apiHint': 'برای کارکرد کامل API را اجرا کنید: npm run dev:api',
  'dash.totalProducts': 'کل محصولات',
  'dash.totalOrders': 'کل سفارش‌ها',
  'dash.categories': 'دسته‌بندی‌ها',
  'dash.totalRevenue': 'درآمد کل',
  'dash.manage': 'مدیریت',
  'dash.viewDetails': 'جزئیات',
  'dash.recentOrders': 'سفارش‌های اخیر',
  'dash.viewAll': 'مشاهده همه',
  'dash.noOrders': 'هنوز سفارشی نیست',
  'dash.noOrdersHint': 'سفارش‌ها پس از تسویه مشتری اینجا ظاهر می‌شوند.',
  'dash.addProductFirst': 'ابتدا محصول اضافه کنید — از کاتالوگ خالی نمی‌توان خرید.',
  'dash.addFirstProduct': 'اولین محصول را اضافه کنید',
  'dash.bestSellers': 'پرفروش‌ها',
  'dash.latestProducts': 'جدیدترین محصولات',
  'dash.rankedByRevenue': 'مرتب‌شده بر اساس درآمد',
  'dash.noSalesYet': 'هنوز فروشی نیست — جدیدترین محصولات نمایش داده می‌شود',
  'dash.noProducts': 'هنوز محصولی نیست',
  'dash.emptyCatalogue': 'کاتالوگ خالی است. برای فروش محصول اضافه کنید.',
  'dash.soldStock': '{n} فروش · موجودی: {stock}',
  'dash.stock': 'موجودی: {stock}',
  'dash.revenue': 'درآمد',
  'dash.price': 'قیمت',
  'dash.quickActions': 'اقدامات سریع',
  'dash.addProduct': 'افزودن محصول',
  'dash.manageOrders': 'مدیریت سفارش‌ها',
  'dash.manageUsers': 'مدیریت کاربران',
  'prod.total': '{n} محصول',
  'prod.add': '+ افزودن محصول',
  'prod.search': 'جستجو بر اساس نام یا SKU...',
  'prod.colProduct': 'محصول',
  'prod.colSku': 'SKU',
  'prod.colCategory': 'دسته',
  'prod.colPrice': 'قیمت',
  'prod.colStock': 'موجودی',
  'prod.colStatus': 'وضعیت',
  'prod.colActions': 'عملیات',
  'prod.edit': 'ویرایش',
  'prod.delete': 'حذف',
  'prod.none': 'محصولی یافت نشد',
  'prod.loading': 'در حال بارگذاری محصولات...',
  'prod.confirmDelete': 'این محصول حذف شود؟',
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
  'dash.apiDisconnected': 'API پچڕاوە',
  'dash.apiHint': 'بۆ کارکردنی تەواو API دەستپێبکە: npm run dev:api',
  'dash.totalProducts': 'کۆی بەرهەمەکان',
  'dash.totalOrders': 'کۆی داواکارییەکان',
  'dash.categories': 'پۆلەکان',
  'dash.totalRevenue': 'کۆی داهات',
  'dash.manage': 'بەڕێوەبردن',
  'dash.viewDetails': 'وردەکاری',
  'dash.recentOrders': 'داواکارییەکانی دوایی',
  'dash.viewAll': 'هەموو ببینە',
  'dash.noOrders': 'هێشتا داواکاری نییە',
  'dash.noOrdersHint': 'کاتێک کڕیار پارە دەدات لێرە دەردەکەون.',
  'dash.addProductFirst': 'سەرەتا بەرهەم زیاد بکە — کاتالۆگی بەتاڵ فرۆش ناکات.',
  'dash.addFirstProduct': 'یەکەم بەرهەم زیاد بکە',
  'dash.bestSellers': 'باشترین فرۆشراو',
  'dash.latestProducts': 'نوێترین بەرهەمەکان',
  'dash.rankedByRevenue': 'ڕیزکراو بەپێی داهات',
  'dash.noSalesYet': 'هێشتا فرۆشتن نییە — نوێترین بەرهەمەکان پیشان دەدرێن',
  'dash.noProducts': 'هێشتا بەرهەم نییە',
  'dash.emptyCatalogue': 'کاتالۆگ بەتاڵە. بۆ فرۆشتن بەرهەم زیاد بکە.',
  'dash.soldStock': '{n} فرۆشراو · کۆگا: {stock}',
  'dash.stock': 'کۆگا: {stock}',
  'dash.revenue': 'داهات',
  'dash.price': 'نرخ',
  'dash.quickActions': 'کرداری خێرا',
  'dash.addProduct': 'زیادکردنی بەرهەم',
  'dash.manageOrders': 'بەڕێوەبردنی داواکاری',
  'dash.manageUsers': 'بەڕێوەبردنی بەکارهێنەر',
  'prod.total': '{n} بەرهەم',
  'prod.add': '+ زیادکردنی بەرهەم',
  'prod.search': 'گەڕان بە ناو یان SKU...',
  'prod.colProduct': 'بەرهەم',
  'prod.colSku': 'SKU',
  'prod.colCategory': 'پۆل',
  'prod.colPrice': 'نرخ',
  'prod.colStock': 'کۆگا',
  'prod.colStatus': 'دۆخ',
  'prod.colActions': 'کردارەکان',
  'prod.edit': 'دەستکاری',
  'prod.delete': 'سڕینەوە',
  'prod.none': 'هیچ بەرهەمێک نەدۆزرایەوە',
  'prod.loading': 'بەرهەمەکان باردەکرێن...',
  'prod.confirmDelete': 'دڵنیایت دەتەوێت ئەم بەرهەمە بسڕیتەوە؟',
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
