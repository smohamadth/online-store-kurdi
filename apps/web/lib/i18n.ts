'use client';

import { createContext, useContext, useState, useEffect } from 'react';

/**
 * SSR seed for the i18n hook.
 *
 * The server root layout (app/layout.tsx) resolves a locale from the cookie
 * and Accept-Language, then renders <html lang="..." dir="..."> AND passes
 * the same values down to AppShell. AppShell stuffs them in this context
 * so useTranslation() can read them as its initial state, before the
 * localStorage / navigator.language effect runs.
 *
 * Without this seed the first client render always uses 'en' / 'ltr', which
 * (a) disagrees with the server-rendered <html> for a frame, causing a
 * flash of LTR/English content for Kurdish or Arabic visitors, and
 * (b) makes tests that render components with non-English locale unstable
 * because every assertion sees a re-render after the effect lands.
 *
 * The matching <I18nSeedProvider> lives in `lib/I18nSeedProvider.tsx` because
 * the provider needs JSX, and this file is `i18n.ts` (renaming to `.tsx`
 * would force every importer to update its path).
 */
export interface I18nSeed {
  lang: string;
  dir: 'ltr' | 'rtl';
  /**
   * The admin-editable catalog from GET /api/i18n/storefront, already fetched
   * on the SERVER. Without it the client used to render the built-in English
   * dictionary first and swap in the overlay from a mount effect, which
   * produced different text than the server had rendered — React error #425
   * ("server rendered HTML didn't match the client") on every translated
   * page. Seeding it here means the first client render matches the server.
   */
  catalog?: StorefrontI18nCatalog | null;
}

export interface StorefrontI18nCatalog {
  languages?: { code: string; name: string; dir: 'ltr' | 'rtl'; flag?: string; enabled?: boolean }[];
  strings?: Record<string, Record<string, string>>;
}

export const I18nSeedContext = createContext<I18nSeed | null>(null);

// Supported languages
export const languages = [
  { code: 'en', name: 'English', dir: 'ltr', flag: '🇬🇧' },
  { code: 'ku', name: 'کوردی', dir: 'rtl', flag: '🏴' },
  { code: 'ar', name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'fa', name: 'فارسی', dir: 'rtl', flag: '🇮🇷' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr', flag: '🇹🇷' },
];

// Translation dictionaries
const dictionaries: Record<string, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.products': 'Products',
    'nav.cart': 'Cart',
    'nav.account': 'My Account',
    'nav.login': 'Sign In',
    'nav.register': 'Sign Up',
    'nav.logout': 'Logout',
    'nav.search': 'Search products...',
    'nav.blog': 'Blog',
    'nav.admin': 'Admin Panel',
    
    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.close': 'Close',
    'common.submit': 'Submit',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.previous': 'Previous',
    'common.viewAll': 'View All',
    'common.learnMore': 'Learn More',
    
    // Products
    'products.title': 'Products',
    'products.addToCart': 'Add to Cart',
    'products.buyNow': 'Buy Now',
    'products.outOfStock': 'Out of Stock',
    'products.inStock': 'In Stock',
    'products.description': 'Description',
    'products.reviews': 'Reviews',
    'products.relatedProducts': 'Related Products',
    'products.noProducts': 'No products found',
    'products.filter': 'Filter',
    'products.sort': 'Sort by',
    'products.category': 'Category',
    'products.price': 'Price',
    
    // Cart
    'cart.title': 'Shopping Cart',
    'cart.empty': 'Your cart is empty',
    'cart.subtotal': 'Subtotal',
    'cart.total': 'Total',
    'cart.checkout': 'Proceed to Checkout',
    'cart.continueShopping': 'Continue Shopping',
    'cart.remove': 'Remove',
    'cart.saveForLater': 'Save for Later',
    'cart.moveToCart': 'Move to Cart',
    'cart.savedItems': 'Saved Items',
    
    // Checkout
    'checkout.title': 'Checkout',
    'checkout.shippingInfo': 'Shipping Information',
    'checkout.paymentMethod': 'Payment Method',
    'checkout.orderSummary': 'Order Summary',
    'checkout.placeOrder': 'Place Order',
    'checkout.firstName': 'First Name',
    'checkout.lastName': 'Last Name',
    'checkout.email': 'Email',
    'checkout.phone': 'Phone',
    'checkout.address': 'Address',
    'checkout.city': 'City',
    'checkout.state': 'State',
    'checkout.zipCode': 'ZIP Code',
    'checkout.country': 'Country',
    
    // Account
    'account.dashboard': 'Dashboard',
    'account.orders': 'Orders',
    'account.wishlist': 'Wishlist',
    'account.reviews': 'Reviews',
    'account.addresses': 'Addresses',
    'account.profile': 'Edit Profile',
    'account.security': 'Security',
    
    // Footer
    'footer.shop': 'Shop',
    'footer.account': 'Account',
    'footer.connect': 'Connect',
    'footer.allRights': 'All rights reserved',
    'footer.support': 'Support',
    'footer.legal': 'Legal',
    'footer.info': 'Info',
    'footer.contact': 'Contact Us',
    'footer.faq': 'FAQ',
    'footer.returns': 'Returns',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    'footer.trackOrder': 'Track Order',
    'footer.allProducts': 'All Products',
    'footer.orderHistory': 'Order History',
    
    // Messages
    'msg.addedToCart': 'Added to cart!',
    'msg.orderPlaced': 'Order placed successfully!',
    'msg.profileUpdated': 'Profile updated successfully!',
    'msg.passwordChanged': 'Password changed successfully!',
    'msg.addressAdded': 'Address added successfully!',
    'msg.reviewSubmitted': 'Review submitted!',
    'msg.subscribed': 'Successfully subscribed!',
    'msg.contactSent': 'Message sent! We will reply within 24 hours.',
    'search.searching': 'Searching...',
    'search.products': 'Products',
    'search.viewAll': 'View all results',
    'search.noResults': 'No products found',
    'search.tryDifferent': 'Try a different search term',
    'search.recent': 'Recent searches',
    'search.clear': 'Clear',
    'search.popular': 'Popular searches',
    'account.downloads': 'Downloads',
    'account.affiliate': 'Affiliate',
    'account.menu': 'Account menu',
    'checkout.shippingMethod': 'Shipping Method',
    'checkout.wallet': 'Wallet Credit',
    'checkout.storeCredit': 'Use my store credit',
    'checkout.giftCard': 'Gift card code',
    'checkout.check': 'Check',
    'checkout.cod': 'Cash on Delivery',
    'checkout.bankTransfer': 'Bank Transfer',
    'checkout.secure': 'Secure checkout',
    'checkout.shipping': 'Shipping',
    'checkout.tax': 'Tax',
    'checkout.discount': 'Discount',
    'checkout.amountDue': 'Amount due',
    'checkout.free': 'Free',
    'checkout.success': 'Order placed successfully!',
    'checkout.thankYou': 'Thank you for your purchase',
    'checkout.viewOrders': 'View Orders',
    'cart.emptyHint': 'Looks like you have not added any items yet.',
    'cart.clear': 'Clear cart',
    'cart.items': 'items',
    'pdp.loading': 'Loading product...',
    'pdp.notFound': 'Product not found',
    'pdp.backToProducts': 'Back to Products',
    'pdp.reviews': '{n} reviews',
    'pdp.instantDownload': 'Instant download',
    'pdp.inStockCount': '✓ In stock ({n} available)',
    'pdp.availableDigital': '✓ Available — download link delivered instantly after purchase',
    'pdp.preorder': '⏳ Preorder available (ships when restocked)',
    'pdp.outOfStock': '✗ Out of stock',
    'pdp.save': 'Save {amount}',
    'pdp.notifyMe': 'Notify Me',
    'pdp.notifyWhenBack': '🔔 Notify me when back in stock',
    'pdp.notifySuccess': '✓ You will be notified when this product is back in stock!',
    'pdp.enterEmail': 'Enter your email',
    'pdp.options': 'Options',
    'pdp.quantity': 'Quantity:',
    'pdp.added': '✓ Added!',
    'pdp.preorderBtn': '⏳ Preorder',
    'pdp.downloadNow': '⬇ Download now',
    'pdp.compare': '⚖️ Compare',
    'pdp.addedCompare': '✓ Added to compare',
    'pdp.sku': 'SKU',
    'pdp.share': 'Share',
    'pdp.freeShipping': 'Free shipping',
    'pdp.freeShippingText': 'On orders over 50',
    'pdp.returns': '30-day returns',
    'pdp.returnsText': 'Hassle-free refunds',
    'pdp.secureCheckout': 'Secure checkout',
    'pdp.secureText': 'Encrypted payments',
    'pdp.support': '24/7 support',
    'pdp.supportText': 'We reply within hours',
    'pdp.youMayLike': 'You may also like',
    'pdp.boughtTogether': 'Products customers often buy together',
    'pdp.quickPurchase': 'Quick purchase',
    'pdp.expectedRestock': 'Expected restock: {date}',
    'catalog.sortNewest': 'Newest',
    'catalog.sortOldest': 'Oldest',
    'catalog.sortPopular': 'Most reviewed',
    'catalog.sortPriceAsc': 'Price: Low to High',
    'catalog.sortPriceDesc': 'Price: High to Low',
    'catalog.sortNameAsc': 'Name A-Z',
    'catalog.sortNameDesc': 'Name Z-A',
    'catalog.sortRating': 'Highest Rated',
    'catalog.sortMostPopular': 'Most Popular',
    'catalog.sortBy': 'Sort by:',
    'catalog.all': 'All',
    'catalog.productOne': 'product',
    'catalog.productMany': 'products',
    'catalog.nothingHere': 'Nothing here yet',
    'catalog.nothingHint': 'This category has no products at the moment.',
    'catalog.browseAll': 'Browse all products',
    'catalog.prev': '‹ Prev',
    'catalog.next': 'Next ›',
    'catalog.results': '{n} results',
    'catalog.resultOne': '1 result',
    'catalog.hideFilters': 'Hide filters',
    'catalog.filters': 'Filters',
    'catalog.clearFilters': 'Clear all filters',
    'catalog.loading': 'Loading products…',
    'catalog.search': 'Search products...',
    'catalog.inStockOnly': 'In stock only',
    'catalog.onSale': 'On sale',
    'footer.comingSoon': 'Coming soon',
  },
  
  ku: {
    // Navigation
    'nav.home': 'سەرەتا',
    'nav.products': 'بەرهەمەکان',
    'nav.cart': 'سەبەتە',
    'nav.account': 'هەژمارەکەم',
    'nav.login': 'چوونەژوورەوە',
    'nav.register': 'تۆمارکردن',
    'nav.logout': 'دەرچوون',
    'nav.search': 'گەڕان لە بەرهەمەکان...',
    'nav.blog': 'بلۆگ',
    'nav.admin': 'پانێڵی بەڕێوەبەر',
    
    // Common
    'common.loading': 'چاوەڕوانی...',
    'common.save': 'پاشەکەوتکردن',
    'common.cancel': 'هەڵوەشاندنەوە',
    'common.delete': 'سڕینەوە',
    'common.edit': 'دەستکاریکردن',
    'common.add': 'زیادکردن',
    'common.close': 'داخستن',
    'common.submit': 'ناردن',
    'common.back': 'گەڕانەوە',
    'common.next': 'دواتر',
    'common.previous': 'پێشتر',
    'common.viewAll': 'پیشاندانی هەموو',
    'common.learnMore': 'زیاتر بزانە',
    
    // Products
    'products.title': 'بەرهەمەکان',
    'products.addToCart': 'زیادکردن بۆ سەبەتە',
    'products.buyNow': 'کڕین ئێستا',
    'products.outOfStock': 'نەماوە',
    'products.inStock': 'لە بەردەستدایە',
    'products.description': 'وەسف',
    'products.reviews': 'پێداچوونەوەکان',
    'products.relatedProducts': 'بەرهەمەکانی پەیوەندیدار',
    'products.noProducts': 'هیچ بەرهەمێک نەدۆزرایەوە',
    'products.filter': 'فلتەر',
    'products.sort': 'ڕیزکردن',
    'products.category': 'پۆل',
    'products.price': 'نرخ',
    
    // Cart
    'cart.title': 'سەبەتەی کڕین',
    'cart.empty': 'سەبەتەکەت بەتاڵە',
    'cart.subtotal': 'کۆی ژێرگیراو',
    'cart.total': 'کۆی گشتی',
    'cart.checkout': 'بەردەوامبوون بۆ پارەدان',
    'cart.continueShopping': 'بەردەوامبوون لە کڕین',
    'cart.remove': 'لابردن',
    'cart.saveForLater': 'پاشەکەوتکردن بۆ دواتر',
    'cart.moveToCart': 'گواستنەوە بۆ سەبەتە',
    'cart.savedItems': 'بەرهەمە پاشەکەوتکراوەکان',
    
    // Checkout
    'checkout.title': 'پارەدان',
    'checkout.shippingInfo': 'زانیاری ناردن',
    'checkout.paymentMethod': 'ڕێگای پارەدان',
    'checkout.orderSummary': 'کورتەی داواکاری',
    'checkout.placeOrder': 'داواکاری ناردن',
    'checkout.firstName': 'ناوی یەکەم',
    'checkout.lastName': 'ناوی کۆتایی',
    'checkout.email': 'ئیمەیڵ',
    'checkout.phone': 'تەلەفۆن',
    'checkout.address': 'ناونیشان',
    'checkout.city': 'شار',
    'checkout.state': 'هەرێم',
    'checkout.zipCode': 'کۆدی پۆستی',
    'checkout.country': 'وەلات',
    
    // Account
    'account.dashboard': 'داشبۆرد',
    'account.orders': 'داواکاریەکان',
    'account.wishlist': 'لیستی دڵخوازەکان',
    'account.reviews': 'پێداچوونەوەکان',
    'account.addresses': 'ناونیشانەکان',
    'account.profile': 'دەستکاریکردنی پرۆفایل',
    'account.security': 'ئاسایش',
    
    // Footer
    'footer.shop': 'فرۆشگا',
    'footer.account': 'هەژمار',
    'footer.connect': 'پەیوەندی',
    'footer.allRights': 'هەموو مافەکان پارێزراون',
    'footer.support': 'پشتیوانی',
    'footer.legal': 'یاسایی',
    'footer.info': 'زانیاری',
    'footer.contact': 'پەیوەندیمان پێوە بکە',
    'footer.faq': 'پرسیارە باوەکان',
    'footer.returns': 'گەڕاندنەوە',
    'footer.privacy': 'سیاسەتی تایبەتمەندی',
    'footer.terms': 'مەرجەکانی بەکارهێنان',
    'footer.trackOrder': 'بەدواداچوونی داواکاری',
    'footer.allProducts': 'هەموو بەرهەمەکان',
    'footer.orderHistory': 'مێژووی داواکاریەکان',
    
    // Messages
    'msg.addedToCart': 'زیادکرا بۆ سەبەتە!',
    'msg.orderPlaced': 'داواکاریەکەت سەرکەوتوو بوو!',
    'msg.profileUpdated': 'پرۆفایل نوێکرایەوە!',
    'msg.passwordChanged': 'وشەی نهێنی گۆڕا!',
    'msg.addressAdded': 'ناونیشان زیادکرا!',
    'msg.reviewSubmitted': 'پێداچوونەوە ناردرا!',
    'msg.subscribed': 'سەرکەوتوو بوو!',
    'msg.contactSent': 'پەیام ناردرا! لە ماوەی ٢٤ کاتژمێردا وەڵامت دەهێنینەوە.',
    'search.searching': 'گەڕان...',
    'search.products': 'بەرهەمەکان',
    'search.viewAll': 'بینینی هەموو ئەنجامەکان',
    'search.noResults': 'هیچ بەرهەمێک نەدۆزرایەوە',
    'search.tryDifferent': 'وشەیەکی تر تاقی بکەوە',
    'search.recent': 'گەڕانەکانی دوایی',
    'search.clear': 'پاککردنەوە',
    'search.popular': 'گەڕانە باوەکان',
    'account.downloads': 'داگرتنەکان',
    'account.affiliate': 'هاوبەشی فرۆشتن',
    'account.menu': 'مێنیووی هەژمار',
    'checkout.shippingMethod': 'شێوازی گەیاندن',
    'checkout.wallet': 'کرێدیتی جزدان',
    'checkout.storeCredit': 'کرێدیتی فرۆشگاکەم بەکاربهێنە',
    'checkout.giftCard': 'کۆدی کارتی دیاری',
    'checkout.check': 'پشکنین',
    'checkout.cod': 'پارەدان لە کاتی گەیاندن',
    'checkout.bankTransfer': 'گواستنەوەی بانکی',
    'checkout.secure': 'پارەدانی پارێزراو',
    'checkout.shipping': 'گەیاندن',
    'checkout.tax': 'باج',
    'checkout.discount': 'داشکاندن',
    'checkout.amountDue': 'بڕی ماوە',
    'checkout.free': 'بەخۆڕایی',
    'checkout.success': 'داواکاریەکەت سەرکەوتوو بوو!',
    'checkout.thankYou': 'سوپاس بۆ کڕینەکەت',
    'checkout.viewOrders': 'بینینی داواکاریەکان',
    'cart.emptyHint': 'هێشتا هیچت نەخستووەتە سەبەتەوە.',
    'cart.clear': 'بەتاڵکردنی سەبەتە',
    'cart.items': 'دانە',
    'pdp.loading': 'بەرهەم باردەکرێت...',
    'pdp.notFound': 'بەرهەم نەدۆزرایەوە',
    'pdp.backToProducts': 'گەڕانەوە بۆ بەرهەمەکان',
    'pdp.reviews': '{n} پێداچوونەوە',
    'pdp.instantDownload': 'داگرتنی خێرا',
    'pdp.inStockCount': '✓ لە کۆگادایە ({n} دانە)',
    'pdp.availableDigital': '✓ بەردەستە — لینکی داگرتن دوای کڕین دەگات',
    'pdp.preorder': '⏳ پێشەکی داواکردن بەردەستە (کاتێک دێتەوە دەنێردرێت)',
    'pdp.outOfStock': '✗ نەماوە',
    'pdp.save': 'پاشەکەوت {amount}',
    'pdp.notifyMe': 'ئاگادارم بکەوە',
    'pdp.notifyWhenBack': '🔔 کاتێک گەڕایەوە ئاگادارم بکەوە',
    'pdp.notifySuccess': '✓ ئاگادارت دەکەینەوە کاتێک بەرهەمەکە دێتەوە!',
    'pdp.enterEmail': 'ئیمەیڵەکەت بنووسە',
    'pdp.options': 'هەڵبژاردەکان',
    'pdp.quantity': 'بڕ:',
    'pdp.added': '✓ زیادکرا!',
    'pdp.preorderBtn': '⏳ پێشەکی داواکردن',
    'pdp.downloadNow': '⬇ ئێستا دایگرە',
    'pdp.compare': '⚖️ بەراوردکردن',
    'pdp.addedCompare': '✓ زیادکرا بۆ بەراورد',
    'pdp.sku': 'کۆدی SKU',
    'pdp.share': 'هاوبەشکردن',
    'pdp.freeShipping': 'گەیاندنی بەخۆڕایی',
    'pdp.freeShippingText': 'بۆ داواکاریی سەروو ٥٠',
    'pdp.returns': 'گەڕاندنەوەی ٣٠ ڕۆژە',
    'pdp.returnsText': 'گەڕاندنەوەی ئاسان',
    'pdp.secureCheckout': 'پارەدانی پارێزراو',
    'pdp.secureText': 'پارەدانی نهێنی کراو',
    'pdp.support': 'پشتیوانی ٢٤/٧',
    'pdp.supportText': 'لە چەند کاتژمێرێکدا وەڵام دەدەینەوە',
    'pdp.youMayLike': 'ڕەنگە حەزت لێبێت',
    'pdp.boughtTogether': 'بەرهەمەکانی کڕیاران پێکەوە دەیکڕن',
    'pdp.quickPurchase': 'کڕینی خێرا',
    'pdp.expectedRestock': 'چاوەڕوانی گەڕانەوە: {date}',
    'catalog.sortNewest': 'نوێترین',
    'catalog.sortOldest': 'کۆنترین',
    'catalog.sortPopular': 'زۆرترین پێداچوونەوە',
    'catalog.sortPriceAsc': 'نرخ: کەم بۆ زۆر',
    'catalog.sortPriceDesc': 'نرخ: زۆر بۆ کەم',
    'catalog.sortNameAsc': 'ناو أ-ی',
    'catalog.sortNameDesc': 'ناو ی-أ',
    'catalog.sortRating': 'بەرزترین هەڵسەنگاندن',
    'catalog.sortMostPopular': 'باوترین',
    'catalog.sortBy': 'ڕیزکردن بەپێی:',
    'catalog.all': 'هەموو',
    'catalog.productOne': 'بەرهەم',
    'catalog.productMany': 'بەرهەم',
    'catalog.nothingHere': 'هێشتا هیچ نییە',
    'catalog.nothingHint': 'ئەم پۆلە ئێستا بەرهەمی تێدا نییە.',
    'catalog.browseAll': 'هەموو بەرهەمەکان ببینە',
    'catalog.prev': '‹ پێشتر',
    'catalog.next': 'دواتر ›',
    'catalog.results': '{n} ئەنجام',
    'catalog.resultOne': '١ ئەنجام',
    'catalog.hideFilters': 'شاردنەوەی فلتەر',
    'catalog.filters': 'فلتەرەکان',
    'catalog.clearFilters': 'سڕینەوەی هەموو فلتەرەکان',
    'catalog.loading': 'بەرهەمەکان باردەکرێن…',
    'catalog.search': 'گەڕان لە بەرهەمەکان...',
    'catalog.inStockOnly': 'تەنها لە کۆگادا',
    'catalog.onSale': 'لە فرۆشتندا',
    'footer.comingSoon': 'بەم زووانە',
  },
  
  ar: {
    // Navigation
    'nav.home': 'الرئيسية',
    'nav.products': 'المنتجات',
    'nav.cart': 'سلة التسوق',
    'nav.account': 'حسابي',
    'nav.login': 'تسجيل الدخول',
    'nav.register': 'إنشاء حساب',
    'nav.logout': 'تسجيل الخروج',
    'nav.search': 'البحث عن المنتجات...',
    'nav.blog': 'المدونة',
    'nav.admin': 'لوحة التحكم',
    
    // Common
    'common.loading': 'جاري التحميل...',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.add': 'إضافة',
    'common.close': 'إغلاق',
    'common.submit': 'إرسال',
    'common.back': 'رجوع',
    'common.next': 'التالي',
    'common.previous': 'السابق',
    'common.viewAll': 'عرض الكل',
    'common.learnMore': 'اعرف المزيد',
    
    // Products
    'products.title': 'المنتجات',
    'products.addToCart': 'أضف إلى السلة',
    'products.buyNow': 'اشتر الآن',
    'products.outOfStock': 'غير متوفر',
    'products.inStock': 'متوفر',
    'products.description': 'الوصف',
    'products.reviews': 'التقييمات',
    'products.relatedProducts': 'منتجات ذات صلة',
    'products.noProducts': 'لم يتم العثور على منتجات',
    'products.filter': 'تصفية',
    'products.sort': 'ترتيب حسب',
    'products.category': 'الفئة',
    'products.price': 'السعر',
    
    // Cart
    'cart.title': 'سلة التسوق',
    'cart.empty': 'سلتك فارغة',
    'cart.subtotal': 'المجموع الفرعي',
    'cart.total': 'الإجمالي',
    'cart.checkout': 'إتمام الشراء',
    'cart.continueShopping': 'متابعة التسوق',
    'cart.remove': 'إزالة',
    'cart.saveForLater': 'حفظ لوقت لاحق',
    'cart.moveToCart': 'نقل إلى السلة',
    'cart.savedItems': 'المنتجات المحفوظة',
    
    // Checkout
    'checkout.title': 'إتمام الشراء',
    'checkout.shippingInfo': 'معلومات الشحن',
    'checkout.paymentMethod': 'طريقة الدفع',
    'checkout.orderSummary': 'ملخص الطلب',
    'checkout.placeOrder': 'تقديم الطلب',
    'checkout.firstName': 'الاسم الأول',
    'checkout.lastName': 'اسم العائلة',
    'checkout.email': 'البريد الإلكتروني',
    'checkout.phone': 'الهاتف',
    'checkout.address': 'العنوان',
    'checkout.city': 'المدينة',
    'checkout.state': 'الولاية',
    'checkout.zipCode': 'الرمز البريدي',
    'checkout.country': 'الدولة',
    
    // Account
    'account.dashboard': 'لوحة التحكم',
    'account.orders': 'الطلبات',
    'account.wishlist': 'المفضلة',
    'account.reviews': 'التقييمات',
    'account.addresses': 'العناوين',
    'account.profile': 'تعديل الملف الشخصي',
    'account.security': 'الأمان',
    
    // Footer
    'footer.shop': 'المتجر',
    'footer.account': 'الحساب',
    'footer.connect': 'تواصل معنا',
    'footer.allRights': 'جميع الحقوق محفوظة',
    'footer.support': 'الدعم',
    'footer.legal': 'قانوني',
    'footer.info': 'معلومات',
    'footer.contact': 'اتصل بنا',
    'footer.faq': 'الأسئلة الشائعة',
    'footer.returns': 'الإرجاع',
    'footer.privacy': 'سياسة الخصوصية',
    'footer.terms': 'شروط الخدمة',
    'footer.trackOrder': 'تتبع الطلب',
    'footer.allProducts': 'كل المنتجات',
    'footer.orderHistory': 'سجل الطلبات',
    
    // Messages
    'msg.addedToCart': 'تمت الإضافة إلى السلة!',
    'msg.orderPlaced': 'تم تقديم الطلب بنجاح!',
    'msg.profileUpdated': 'تم تحديث الملف الشخصي!',
    'msg.passwordChanged': 'تم تغيير كلمة المرور!',
    'msg.addressAdded': 'تمت إضافة العنوان!',
    'msg.reviewSubmitted': 'تم إرسال التقييم!',
    'msg.subscribed': 'تم الاشتراك بنجاح!',
    'msg.contactSent': 'تم إرسال رسالتك! سنرد خلال 24 ساعة.',
    'search.searching': 'جاري البحث...',
    'search.products': 'المنتجات',
    'search.viewAll': 'عرض كل النتائج',
    'search.noResults': 'لم يتم العثور على منتجات',
    'search.tryDifferent': 'جرّب عبارة بحث أخرى',
    'search.recent': 'عمليات البحث الأخيرة',
    'search.clear': 'مسح',
    'search.popular': 'عمليات بحث شائعة',
    'account.downloads': 'التنزيلات',
    'account.affiliate': 'التسويق بالعمولة',
    'account.menu': 'قائمة الحساب',
    'checkout.shippingMethod': 'طريقة الشحن',
    'checkout.wallet': 'رصيد المحفظة',
    'checkout.storeCredit': 'استخدم رصيد المتجر',
    'checkout.giftCard': 'رمز بطاقة الهدايا',
    'checkout.check': 'تحقق',
    'checkout.cod': 'الدفع عند الاستلام',
    'checkout.bankTransfer': 'تحويل بنكي',
    'checkout.secure': 'دفع آمن',
    'checkout.shipping': 'الشحن',
    'checkout.tax': 'الضريبة',
    'checkout.discount': 'الخصم',
    'checkout.amountDue': 'المبلغ المستحق',
    'checkout.free': 'مجاني',
    'checkout.success': 'تم تقديم الطلب بنجاح!',
    'checkout.thankYou': 'شكرًا لشرائك',
    'checkout.viewOrders': 'عرض الطلبات',
    'cart.emptyHint': 'لم تضف أي منتجات بعد.',
    'cart.clear': 'إفراغ السلة',
    'cart.items': 'عناصر',
    'pdp.loading': 'جاري تحميل المنتج...',
    'pdp.notFound': 'المنتج غير موجود',
    'pdp.backToProducts': 'العودة إلى المنتجات',
    'pdp.reviews': '{n} تقييمات',
    'pdp.instantDownload': 'تنزيل فوري',
    'pdp.inStockCount': '✓ متوفر ({n})',
    'pdp.availableDigital': '✓ متاح — يُرسل رابط التنزيل فور الشراء',
    'pdp.preorder': '⏳ الطلب المسبق متاح (يشحن عند التوفر)',
    'pdp.outOfStock': '✗ غير متوفر',
    'pdp.save': 'وفر {amount}',
    'pdp.notifyMe': 'أخبرني',
    'pdp.notifyWhenBack': '🔔 أخبرني عند التوفر',
    'pdp.notifySuccess': '✓ سنخبرك عند عودة المنتج!',
    'pdp.enterEmail': 'أدخل بريدك الإلكتروني',
    'pdp.options': 'الخيارات',
    'pdp.quantity': 'الكمية:',
    'pdp.added': '✓ تمت الإضافة!',
    'pdp.preorderBtn': '⏳ طلب مسبق',
    'pdp.downloadNow': '⬇ نزّل الآن',
    'pdp.compare': '⚖️ مقارنة',
    'pdp.addedCompare': '✓ أضيف للمقارنة',
    'pdp.sku': 'رمز المنتج',
    'pdp.share': 'مشاركة',
    'pdp.freeShipping': 'شحن مجاني',
    'pdp.freeShippingText': 'للطلبات فوق 50',
    'pdp.returns': 'إرجاع خلال 30 يوماً',
    'pdp.returnsText': 'استرداد سهل',
    'pdp.secureCheckout': 'دفع آمن',
    'pdp.secureText': 'مدفوعات مشفّرة',
    'pdp.support': 'دعم ٢٤/٧',
    'pdp.supportText': 'نرد خلال ساعات',
    'pdp.youMayLike': 'قد يعجبك أيضاً',
    'pdp.boughtTogether': 'منتجات يشتريها العملاء معاً',
    'pdp.quickPurchase': 'شراء سريع',
    'pdp.expectedRestock': 'التوفر المتوقع: {date}',
    'catalog.sortNewest': 'الأحدث',
    'catalog.sortOldest': 'الأقدم',
    'catalog.sortPopular': 'الأكثر تقييماً',
    'catalog.sortPriceAsc': 'السعر: من الأقل للأعلى',
    'catalog.sortPriceDesc': 'السعر: من الأعلى للأقل',
    'catalog.sortNameAsc': 'الاسم أ-ي',
    'catalog.sortNameDesc': 'الاسم ي-أ',
    'catalog.sortRating': 'الأعلى تقييماً',
    'catalog.sortMostPopular': 'الأكثر شعبية',
    'catalog.sortBy': 'ترتيب حسب:',
    'catalog.all': 'الكل',
    'catalog.productOne': 'منتج',
    'catalog.productMany': 'منتجات',
    'catalog.nothingHere': 'لا يوجد شيء بعد',
    'catalog.nothingHint': 'لا توجد منتجات في هذا التصنيف حالياً.',
    'catalog.browseAll': 'تصفح كل المنتجات',
    'catalog.prev': '‹ السابق',
    'catalog.next': 'التالي ›',
    'catalog.results': '{n} نتائج',
    'catalog.resultOne': 'نتيجة واحدة',
    'catalog.hideFilters': 'إخفاء الفلاتر',
    'catalog.filters': 'فلاتر',
    'catalog.clearFilters': 'مسح كل الفلاتر',
    'catalog.loading': 'جاري تحميل المنتجات…',
    'catalog.search': 'البحث عن المنتجات...',
    'catalog.inStockOnly': 'المتوفّر فقط',
    'catalog.onSale': 'تخفيضات',
    'footer.comingSoon': 'قريبًا',
  },

  fa: {
    // Navigation
    'nav.home': 'خانه',
    'nav.products': 'محصولات',
    'nav.cart': 'سبد خرید',
    'nav.account': 'حساب من',
    'nav.login': 'ورود',
    'nav.register': 'ثبت‌نام',
    'nav.logout': 'خروج',
    'nav.search': 'جستجوی محصولات...',
    'nav.blog': 'وبلاگ',
    'nav.admin': 'پنل مدیریت',

    // Common
    'common.loading': 'در حال بارگذاری...',
    'common.save': 'ذخیره',
    'common.cancel': 'انصراف',
    'common.delete': 'حذف',
    'common.edit': 'ویرایش',
    'common.add': 'افزودن',
    'common.close': 'بستن',
    'common.submit': 'ثبت',
    'common.back': 'بازگشت',
    'common.next': 'بعدی',
    'common.previous': 'قبلی',
    'common.viewAll': 'مشاهده همه',
    'common.learnMore': 'بیشتر بدانید',

    // Products
    'products.title': 'محصولات',
    'products.addToCart': 'افزودن به سبد',
    'products.buyNow': 'خرید فوری',
    'products.outOfStock': 'ناموجود',
    'products.inStock': 'موجود',
    'products.description': 'توضیحات',
    'products.reviews': 'نظرات',
    'products.relatedProducts': 'محصولات مرتبط',
    'products.noProducts': 'محصولی یافت نشد',
    'products.filter': 'فیلتر',
    'products.sort': 'مرتب‌سازی بر اساس',
    'products.category': 'دسته‌بندی',
    'products.price': 'قیمت',

    // Cart
    'cart.title': 'سبد خرید',
    'cart.empty': 'سبد خرید شما خالی است',
    'cart.subtotal': 'جمع جزء',
    'cart.total': 'جمع کل',
    'cart.checkout': 'ادامه و پرداخت',
    'cart.continueShopping': 'ادامه خرید',
    'cart.remove': 'حذف',
    'cart.saveForLater': 'ذخیره برای بعد',
    'cart.moveToCart': 'انتقال به سبد',
    'cart.savedItems': 'اقلام ذخیره‌شده',

    // Checkout
    'checkout.title': 'پرداخت',
    'checkout.shippingInfo': 'اطلاعات ارسال',
    'checkout.paymentMethod': 'روش پرداخت',
    'checkout.orderSummary': 'خلاصه سفارش',
    'checkout.placeOrder': 'ثبت سفارش',
    'checkout.firstName': 'نام',
    'checkout.lastName': 'نام خانوادگی',
    'checkout.email': 'ایمیل',
    'checkout.phone': 'تلفن',
    'checkout.address': 'آدرس',
    'checkout.city': 'شهر',
    'checkout.state': 'استان',
    'checkout.zipCode': 'کد پستی',
    'checkout.country': 'کشور',

    // Account
    'account.dashboard': 'داشبورد',
    'account.orders': 'سفارش‌ها',
    'account.wishlist': 'علاقه‌مندی‌ها',
    'account.reviews': 'نظرات',
    'account.addresses': 'آدرس‌ها',
    'account.profile': 'ویرایش پروفایل',
    'account.security': 'امنیت',

    // Footer
    'footer.shop': 'فروشگاه',
    'footer.account': 'حساب',
    'footer.connect': 'ارتباط',
    'footer.allRights': 'تمام حقوق محفوظ است',
    'footer.support': 'پشتیبانی',
    'footer.legal': 'قوانین',
    'footer.info': 'اطلاعات',
    'footer.contact': 'تماس با ما',
    'footer.faq': 'پرسش‌های متداول',
    'footer.returns': 'مرجوعی',
    'footer.privacy': 'حریم خصوصی',
    'footer.terms': 'شرایط استفاده',
    'footer.trackOrder': 'پیگیری سفارش',
    'footer.allProducts': 'همه محصولات',
    'footer.orderHistory': 'تاریخچه سفارش‌ها',

    // Messages
    'msg.addedToCart': 'به سبد خرید اضافه شد!',
    'msg.orderPlaced': 'سفارش با موفقیت ثبت شد!',
    'msg.profileUpdated': 'پروفایل با موفقیت به‌روزرسانی شد!',
    'msg.passwordChanged': 'رمز عبور با موفقیت تغییر کرد!',
    'msg.addressAdded': 'آدرس با موفقیت اضافه شد!',
    'msg.reviewSubmitted': 'نظر با موفقیت ثبت شد!',
    'msg.subscribed': 'با موفقیت عضو شدید!',
    'msg.contactSent': 'پیام شما ارسال شد! در عرض ۲۴ ساعت پاسخ می‌دهیم.',
    'search.searching': 'در حال جستجو...',
    'search.products': 'محصولات',
    'search.viewAll': 'مشاهده همه نتایج',
    'search.noResults': 'محصولی یافت نشد',
    'search.tryDifferent': 'عبارت دیگری را امتحان کنید',
    'search.recent': 'جستجوهای اخیر',
    'search.clear': 'پاک کردن',
    'search.popular': 'جستجوهای محبوب',
    'account.downloads': 'دانلودها',
    'account.affiliate': 'همکاری در فروش',
    'account.menu': 'منوی حساب',
    'checkout.shippingMethod': 'روش ارسال',
    'checkout.wallet': 'اعتبار کیف پول',
    'checkout.storeCredit': 'از اعتبار فروشگاه استفاده کن',
    'checkout.giftCard': 'کد کارت هدیه',
    'checkout.check': 'بررسی',
    'checkout.cod': 'پرداخت در محل',
    'checkout.bankTransfer': 'انتقال بانکی',
    'checkout.secure': 'پرداخت امن',
    'checkout.shipping': 'ارسال',
    'checkout.tax': 'مالیات',
    'checkout.discount': 'تخفیف',
    'checkout.amountDue': 'مبلغ قابل پرداخت',
    'checkout.free': 'رایگان',
    'checkout.success': 'سفارش با موفقیت ثبت شد!',
    'checkout.thankYou': 'از خرید شما سپاسگزاریم',
    'checkout.viewOrders': 'مشاهده سفارش‌ها',
    'cart.emptyHint': 'هنوز چیزی به سبد اضافه نکرده‌اید.',
    'cart.clear': 'خالی کردن سبد',
    'cart.items': 'قلم',
    'pdp.loading': 'در حال بارگذاری محصول...',
    'pdp.notFound': 'محصول یافت نشد',
    'pdp.backToProducts': 'بازگشت به محصولات',
    'pdp.reviews': '{n} نظر',
    'pdp.instantDownload': 'دانلود فوری',
    'pdp.inStockCount': '✓ موجود ({n} عدد)',
    'pdp.availableDigital': '✓ موجود — لینک دانلود بلافاصله پس از خرید ارسال می‌شود',
    'pdp.preorder': '⏳ پیش‌خرید موجود است (پس از موجود شدن ارسال می‌شود)',
    'pdp.outOfStock': '✗ ناموجود',
    'pdp.save': 'صرفه‌جویی {amount}',
    'pdp.notifyMe': 'خبرم کن',
    'pdp.notifyWhenBack': '🔔 وقتی موجود شد خبرم کن',
    'pdp.notifySuccess': '✓ وقتی محصول برگشت خبرتان می‌کنیم!',
    'pdp.enterEmail': 'ایمیل خود را وارد کنید',
    'pdp.options': 'گزینه‌ها',
    'pdp.quantity': 'تعداد:',
    'pdp.added': '✓ اضافه شد!',
    'pdp.preorderBtn': '⏳ پیش‌خرید',
    'pdp.downloadNow': '⬇ همین حالا دانلود کن',
    'pdp.compare': '⚖️ مقایسه',
    'pdp.addedCompare': '✓ به مقایسه اضافه شد',
    'pdp.sku': 'کد کالا',
    'pdp.share': 'اشتراک‌گذاری',
    'pdp.freeShipping': 'ارسال رایگان',
    'pdp.freeShippingText': 'برای سفارش‌های بالای ۵۰',
    'pdp.returns': 'مرجوعی ۳۰ روزه',
    'pdp.returnsText': 'بازپرداخت آسان',
    'pdp.secureCheckout': 'پرداخت امن',
    'pdp.secureText': 'پرداخت رمزگذاری‌شده',
    'pdp.support': 'پشتیبانی ۲۴/۷',
    'pdp.supportText': 'ظرف چند ساعت پاسخ می‌دهیم',
    'pdp.youMayLike': 'شاید بپسندید',
    'pdp.boughtTogether': 'محصولاتی که مشتریان با هم می‌خرند',
    'pdp.quickPurchase': 'خرید سریع',
    'pdp.expectedRestock': 'موجودی مجدد: {date}',
    'catalog.sortNewest': 'جدیدترین',
    'catalog.sortOldest': 'قدیمی‌ترین',
    'catalog.sortPopular': 'بیشترین نظر',
    'catalog.sortPriceAsc': 'قیمت: کم به زیاد',
    'catalog.sortPriceDesc': 'قیمت: زیاد به کم',
    'catalog.sortNameAsc': 'نام الف-ی',
    'catalog.sortNameDesc': 'نام ی-الف',
    'catalog.sortRating': 'بالاترین امتیاز',
    'catalog.sortMostPopular': 'محبوب‌ترین',
    'catalog.sortBy': 'مرتب‌سازی:',
    'catalog.all': 'همه',
    'catalog.productOne': 'محصول',
    'catalog.productMany': 'محصول',
    'catalog.nothingHere': 'هنوز چیزی نیست',
    'catalog.nothingHint': 'در این دسته فعلاً محصولی نیست.',
    'catalog.browseAll': 'مشاهده همه محصولات',
    'catalog.prev': '‹ قبلی',
    'catalog.next': 'بعدی ›',
    'catalog.results': '{n} نتیجه',
    'catalog.resultOne': '۱ نتیجه',
    'catalog.hideFilters': 'پنهان کردن فیلترها',
    'catalog.filters': 'فیلترها',
    'catalog.clearFilters': 'پاک کردن همه فیلترها',
    'catalog.loading': 'در حال بارگذاری محصولات…',
    'catalog.search': 'جستجوی محصولات...',
    'catalog.inStockOnly': 'فقط موجود',
    'catalog.onSale': 'حراج',
    'footer.comingSoon': 'به‌زودی',
  },

  tr: {
    // Navigation
    'nav.home': 'Ana Sayfa',
    'nav.products': 'Ürünler',
    'nav.cart': 'Sepet',
    'nav.account': 'Hesabım',
    'nav.login': 'Giriş Yap',
    'nav.register': 'Kayıt Ol',
    'nav.logout': 'Çıkış',
    'nav.search': 'Ürünlerde ara...',
    'nav.blog': 'Blog',
    'nav.admin': 'Yönetim Paneli',

    // Common
    'common.loading': 'Yükleniyor...',
    'common.save': 'Kaydet',
    'common.cancel': 'İptal',
    'common.delete': 'Sil',
    'common.edit': 'Düzenle',
    'common.add': 'Ekle',
    'common.close': 'Kapat',
    'common.submit': 'Gönder',
    'common.back': 'Geri',
    'common.next': 'Sonraki',
    'common.previous': 'Önceki',
    'common.viewAll': 'Tümünü Gör',
    'common.learnMore': 'Daha Fazla Bilgi',

    // Products
    'products.title': 'Ürünler',
    'products.addToCart': 'Sepete Ekle',
    'products.buyNow': 'Hemen Al',
    'products.outOfStock': 'Stokta Yok',
    'products.inStock': 'Stokta Var',
    'products.description': 'Açıklama',
    'products.reviews': 'Değerlendirmeler',
    'products.relatedProducts': 'İlgili Ürünler',
    'products.noProducts': 'Ürün bulunamadı',
    'products.filter': 'Filtrele',
    'products.sort': 'Sırala',
    'products.category': 'Kategori',
    'products.price': 'Fiyat',

    // Cart
    'cart.title': 'Alışveriş Sepeti',
    'cart.empty': 'Sepetiniz boş',
    'cart.subtotal': 'Ara Toplam',
    'cart.total': 'Toplam',
    'cart.checkout': 'Ödemeye Geç',
    'cart.continueShopping': 'Alışverişe Devam',
    'cart.remove': 'Kaldır',
    'cart.saveForLater': 'Daha Sonra İçin Sakla',
    'cart.moveToCart': 'Sepete Taşı',
    'cart.savedItems': 'Kaydedilen Ürünler',

    // Checkout
    'checkout.title': 'Ödeme',
    'checkout.shippingInfo': 'Kargo Bilgileri',
    'checkout.paymentMethod': 'Ödeme Yöntemi',
    'checkout.orderSummary': 'Sipariş Özeti',
    'checkout.placeOrder': 'Siparişi Tamamla',
    'checkout.firstName': 'Ad',
    'checkout.lastName': 'Soyad',
    'checkout.email': 'E-posta',
    'checkout.phone': 'Telefon',
    'checkout.address': 'Adres',
    'checkout.city': 'Şehir',
    'checkout.state': 'İl',
    'checkout.zipCode': 'Posta Kodu',
    'checkout.country': 'Ülke',

    // Account
    'account.dashboard': 'Panel',
    'account.orders': 'Siparişler',
    'account.wishlist': 'İstek Listesi',
    'account.reviews': 'Değerlendirmeler',
    'account.addresses': 'Adresler',
    'account.profile': 'Profili Düzenle',
    'account.security': 'Güvenlik',

    // Footer
    'footer.shop': 'Mağaza',
    'footer.account': 'Hesap',
    'footer.connect': 'İletişim',
    'footer.allRights': 'Tüm hakları saklıdır',
    'footer.support': 'Destek',
    'footer.legal': 'Yasal',
    'footer.info': 'Bilgi',
    'footer.contact': 'Bize Ulaşın',
    'footer.faq': 'SSS',
    'footer.returns': 'İadeler',
    'footer.privacy': 'Gizlilik Politikası',
    'footer.terms': 'Hizmet Şartları',
    'footer.trackOrder': 'Sipariş Takibi',
    'footer.allProducts': 'Tüm Ürünler',
    'footer.orderHistory': 'Sipariş Geçmişi',

    // Messages
    'msg.addedToCart': 'Sepete eklendi!',
    'msg.orderPlaced': 'Sipariş başarıyla tamamlandı!',
    'msg.profileUpdated': 'Profil başarıyla güncellendi!',
    'msg.passwordChanged': 'Şifre başarıyla değiştirildi!',
    'msg.addressAdded': 'Adres başarıyla eklendi!',
    'msg.reviewSubmitted': 'Değerlendirmeniz gönderildi!',
    'msg.subscribed': 'Başarıyla abone oldunuz!',
    'msg.contactSent': 'Mesajınız gönderildi! 24 saat içinde yanıtlayacağız.',
    'search.searching': 'Aranıyor...',
    'search.products': 'Ürünler',
    'search.viewAll': 'Tüm sonuçları gör',
    'search.noResults': 'Ürün bulunamadı',
    'search.tryDifferent': 'Farklı bir arama deneyin',
    'search.recent': 'Son aramalar',
    'search.clear': 'Temizle',
    'search.popular': 'Popüler aramalar',
    'account.downloads': 'İndirmeler',
    'account.affiliate': 'Satış ortaklığı',
    'account.menu': 'Hesap menüsü',
    'checkout.shippingMethod': 'Kargo yöntemi',
    'checkout.wallet': 'Cüzdan bakiyesi',
    'checkout.storeCredit': 'Mağaza kredimi kullan',
    'checkout.giftCard': 'Hediye kartı kodu',
    'checkout.check': 'Kontrol et',
    'checkout.cod': 'Kapıda ödeme',
    'checkout.bankTransfer': 'Banka havalesi',
    'checkout.secure': 'Güvenli ödeme',
    'checkout.shipping': 'Kargo',
    'checkout.tax': 'Vergi',
    'checkout.discount': 'İndirim',
    'checkout.amountDue': 'Ödenecek tutar',
    'checkout.free': 'Ücretsiz',
    'checkout.success': 'Sipariş başarıyla tamamlandı!',
    'checkout.thankYou': 'Satın aldığınız için teşekkürler',
    'checkout.viewOrders': 'Siparişleri gör',
    'cart.emptyHint': 'Henüz sepete ürün eklemediniz.',
    'cart.clear': 'Sepeti temizle',
    'cart.items': 'ürün',
    'pdp.loading': 'Ürün yükleniyor...',
    'pdp.notFound': 'Ürün bulunamadı',
    'pdp.backToProducts': 'Ürünlere dön',
    'pdp.reviews': '{n} değerlendirme',
    'pdp.instantDownload': 'Anında indirme',
    'pdp.inStockCount': '✓ Stokta ({n} adet)',
    'pdp.availableDigital': '✓ Mevcut — indirme bağlantısı satın alma sonrası anında gelir',
    'pdp.preorder': '⏳ Ön sipariş mümkün (stok gelince kargolanır)',
    'pdp.outOfStock': '✗ Stokta yok',
    'pdp.save': '{amount} tasarruf',
    'pdp.notifyMe': 'Beni haberdar et',
    'pdp.notifyWhenBack': '🔔 Stok gelince haber ver',
    'pdp.notifySuccess': '✓ Ürün gelince sizi bilgilendireceğiz!',
    'pdp.enterEmail': 'E-postanızı girin',
    'pdp.options': 'Seçenekler',
    'pdp.quantity': 'Adet:',
    'pdp.added': '✓ Eklendi!',
    'pdp.addedCompare': '✓ Karşılaştırmaya eklendi',
    'pdp.preorderBtn': '⏳ Ön sipariş',
    'pdp.downloadNow': '⬇ Şimdi indir',
    'pdp.compare': '⚖️ Karşılaştır',
    'pdp.sku': 'SKU',
    'pdp.share': 'Paylaş',
    'pdp.freeShipping': 'Ücretsiz kargo',
    'pdp.freeShippingText': '50 üzeri siparişlerde',
    'pdp.returns': '30 gün iade',
    'pdp.returnsText': 'Sorunsuz iade',
    'pdp.secureCheckout': 'Güvenli ödeme',
    'pdp.secureText': 'Şifreli ödemeler',
    'pdp.support': '7/24 destek',
    'pdp.supportText': 'Saatler içinde yanıtlarız',
    'pdp.youMayLike': 'Bunları da beğenebilirsiniz',
    'pdp.boughtTogether': 'Müşterilerin birlikte aldığı ürünler',
    'pdp.quickPurchase': 'Hızlı satın al',
    'pdp.expectedRestock': 'Beklenen stok: {date}',
    'catalog.sortNewest': 'En yeni',
    'catalog.sortOldest': 'En eski',
    'catalog.sortPopular': 'En çok değerlendirilen',
    'catalog.sortPriceAsc': 'Fiyat: Düşükten yükseğe',
    'catalog.sortPriceDesc': 'Fiyat: Yüksekten düşüğe',
    'catalog.sortNameAsc': 'Ad A-Z',
    'catalog.sortNameDesc': 'Ad Z-A',
    'catalog.sortRating': 'En yüksek puan',
    'catalog.sortMostPopular': 'En popüler',
    'catalog.sortBy': 'Sırala:',
    'catalog.all': 'Tümü',
    'catalog.productOne': 'ürün',
    'catalog.productMany': 'ürün',
    'catalog.nothingHere': 'Henüz bir şey yok',
    'catalog.nothingHint': 'Bu kategoride şu an ürün yok.',
    'catalog.browseAll': 'Tüm ürünlere göz at',
    'catalog.prev': '‹ Önceki',
    'catalog.next': 'Sonraki ›',
    'catalog.results': '{n} sonuç',
    'catalog.resultOne': '1 sonuç',
    'catalog.hideFilters': 'Filtreleri gizle',
    'catalog.filters': 'Filtreler',
    'catalog.clearFilters': 'Tüm filtreleri temizle',
    'catalog.loading': 'Ürünler yükleniyor…',
    'catalog.search': 'Ürünlerde ara...',
    'catalog.inStockOnly': 'Sadece stoktakiler',
    'catalog.onSale': 'İndirimde',
    'footer.comingSoon': 'Yakında',
  },
};

/** The per-language dictionaries, keyed by locale code. */
export const translations = dictionaries;

/** Admin-editable overlays loaded from GET /api/i18n/storefront. */
let storefrontOverlay: Record<string, Record<string, string>> = {};
let extraLanguages: { code: string; name: string; dir: 'ltr' | 'rtl'; flag: string }[] = [];
let enabledCodes: string[] | null = null;

export function applyStorefrontI18nCatalog(data: StorefrontI18nCatalog) {
  storefrontOverlay = data.strings || {};
  if (data.languages?.length) {
    enabledCodes = data.languages.filter((l) => l.enabled !== false).map((l) => l.code);
    extraLanguages = data.languages
      .filter((l) => !languages.some((b) => b.code === l.code))
      .map((l) => ({
        code: l.code,
        name: l.name,
        dir: l.dir === 'rtl' ? 'rtl' as const : 'ltr' as const,
        flag: l.flag || '🏳️',
      }));
  }
}

function lookup(lang: string, key: string): string | undefined {
  return storefrontOverlay[lang]?.[key] || dictionaries[lang]?.[key];
}

function dirFor(code: string): 'ltr' | 'rtl' {
  const d =
    languages.find((l) => l.code === code)?.dir ||
    extraLanguages.find((l) => l.code === code)?.dir;
  return d === 'rtl' ? 'rtl' : 'ltr';
}

function persistLangCookie(code: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `cms.lang=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Every translation key in the English (source) dictionary, sorted. */
export const allTranslationKeys = Object.keys(translations.en).sort();

// Get browser language
function getBrowserLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  
  const saved = localStorage.getItem('language');
  if (saved && (translations[saved] || extraLanguages.some((l) => l.code === saved))) return saved;
  
  const browserLang = navigator.language.split('-')[0];
  if (translations[browserLang]) return browserLang;
  
  return 'en';
}

function applyDocumentLocale(code: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
  document.documentElement.dir = dirFor(code);
}

// Translation hook
export function useTranslation() {
  // Seed with the locale the server already resolved for this request
  // (passed in by AppShell). Before the i18n hook reads from localStorage
  // and the browser, the first render matches the server-rendered
  // <html lang dir>, so there is no flash of LTR/English on hydration.
  const seed = useContext(I18nSeedContext);
  const [language, setLanguage] = useState<string>(seed?.lang ?? 'en');
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(seed?.dir ?? 'ltr');
  const [, setCatalogTick] = useState(0);

  // Apply the server-seeded catalog DURING RENDER, not in an effect. The
  // overlay is module-level state that `t()` reads synchronously, so applying
  // it after mount meant the first client render used the built-in English
  // dictionary while the server had already rendered the overlay's text —
  // React error #425 on every page that calls t(). Doing it here keeps the
  // first client render byte-identical to the server's.
  if (seed?.catalog) applyStorefrontI18nCatalog(seed.catalog);

  useEffect(() => {
    // Already seeded by the server: no refetch, and critically no post-mount
    // swap that would change rendered text after hydration.
    if (seed?.catalog) return;
    fetch('/api/i18n/storefront')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data) {
          applyStorefrontI18nCatalog(j.data);
          setCatalogTick((n) => n + 1);
        }
      })
      .catch(() => { /* built-in dictionaries remain */ });
  }, [seed?.catalog]);

  useEffect(() => {
    const apply = (code: string) => {
      setLanguage(code);
      setDirection(dirFor(code));
      applyDocumentLocale(code);
    };

    // Every useTranslation() instance used to keep its own useState. The
    // switcher updated only itself (and document.dir), so the rest of the
    // storefront stayed English while the layout flipped to RTL.
    const onChange = () => {
      const code = localStorage.getItem('language');
      if (code) apply(code);
    };
    window.addEventListener('languageChange', onChange);

    if (seed) {
      applyDocumentLocale(seed.lang);
    } else {
      apply(getBrowserLanguage());
    }

    return () => window.removeEventListener('languageChange', onChange);
  }, [seed]);

  const changeLanguage = (langCode: string) => {
    setLanguage(langCode);
    setDirection(dirFor(langCode));
    localStorage.setItem('language', langCode);
    persistLangCookie(langCode);
    applyDocumentLocale(langCode);
    window.dispatchEvent(new Event('languageChange'));
  };

  const t = (key: string, fallback?: string, vars?: Record<string, string | number>): string => {
    let s = lookup(language, key) || lookup('en', key) || fallback || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    }
    return s;
  };

  const visibleLanguages = languages
    .concat(extraLanguages)
    .filter((l, i, arr) => arr.findIndex((x) => x.code === l.code) === i)
    .filter((l) => !enabledCodes || enabledCodes.includes(l.code));

  return { t, language, direction, changeLanguage, languages: visibleLanguages };
}

// Translation component helper
export function useTranslations() {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const lang = getBrowserLanguage();
    setLanguage(lang);

    const handleLanguageChange = () => {
      setLanguage(localStorage.getItem('language') || 'en');
    };

    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  const t = (key: string, fallback?: string): string => {
    return translations[language]?.[key] || translations['en']?.[key] || fallback || key;
  };

  return t;
}
