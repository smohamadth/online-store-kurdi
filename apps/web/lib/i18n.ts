'use client';

import { useState, useEffect } from 'react';

// Supported languages
export const languages = [
  { code: 'en', name: 'English', dir: 'ltr', flag: '🇬🇧' },
  { code: 'ku', name: 'کوردی', dir: 'rtl', flag: '🏴' },
  { code: 'ar', name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr', flag: '🇹🇷' },
];

// Translation dictionaries
const translations: Record<string, Record<string, string>> = {
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
    
    // Messages
    'msg.addedToCart': 'Added to cart!',
    'msg.orderPlaced': 'Order placed successfully!',
    'msg.profileUpdated': 'Profile updated successfully!',
    'msg.passwordChanged': 'Password changed successfully!',
    'msg.addressAdded': 'Address added successfully!',
    'msg.reviewSubmitted': 'Review submitted!',
    'msg.subscribed': 'Successfully subscribed!',
    'msg.contactSent': 'Message sent! We will reply within 24 hours.',
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
    
    // Messages
    'msg.addedToCart': 'زیادکرا بۆ سەبەتە!',
    'msg.orderPlaced': 'داواکاریەکەت سەرکەوتوو بوو!',
    'msg.profileUpdated': 'پرۆفایل نوێکرایەوە!',
    'msg.passwordChanged': 'وشەی نهێنی گۆڕا!',
    'msg.addressAdded': 'ناونیشان زیادکرا!',
    'msg.reviewSubmitted': 'پێداچوونەوە ناردرا!',
    'msg.subscribed': 'سەرکەوتوو بوو!',
    'msg.contactSent': 'پەیام ناردرا! لە ماوەی ٢٤ کاتژمێردا وەڵامت دەهێنینەوە.',
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
    
    // Messages
    'msg.addedToCart': 'تمت الإضافة إلى السلة!',
    'msg.orderPlaced': 'تم تقديم الطلب بنجاح!',
    'msg.profileUpdated': 'تم تحديث الملف الشخصي!',
    'msg.passwordChanged': 'تم تغيير كلمة المرور!',
    'msg.addressAdded': 'تمت إضافة العنوان!',
    'msg.reviewSubmitted': 'تم إرسال التقييم!',
    'msg.subscribed': 'تم الاشتراك بنجاح!',
    'msg.contactSent': 'تم إرسال رسالتك! سنرد خلال 24 ساعة.',
  },
};

// Get browser language
function getBrowserLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  
  const saved = localStorage.getItem('language');
  if (saved && translations[saved]) return saved;
  
  const browserLang = navigator.language.split('-')[0];
  if (translations[browserLang]) return browserLang;
  
  return 'en';
}

// Translation hook
export function useTranslation() {
  const [language, setLanguage] = useState('en');
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');

  useEffect(() => {
    const lang = getBrowserLanguage();
    setLanguage(lang);
    
    const langConfig = languages.find(l => l.code === lang);
    setDirection((langConfig?.dir as 'ltr' | 'rtl') || 'ltr');
    
    // Set document direction
    document.documentElement.dir = langConfig?.dir || 'ltr';
    document.documentElement.lang = lang;
  }, []);

  const changeLanguage = (langCode: string) => {
    setLanguage(langCode);
    localStorage.setItem('language', langCode);
    
    const langConfig = languages.find(l => l.code === langCode);
    setDirection((langConfig?.dir as 'ltr' | 'rtl') || 'ltr');
    
    document.documentElement.dir = langConfig?.dir || 'ltr';
    document.documentElement.lang = langCode;
    
    // Force re-render by dispatching event
    window.dispatchEvent(new Event('languageChange'));
  };

  const t = (key: string, fallback?: string): string => {
    return translations[language]?.[key] || translations['en']?.[key] || fallback || key;
  };

  return { t, language, direction, changeLanguage, languages };
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
