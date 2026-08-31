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
export const I18nSeedContext = createContext<{ lang: string; dir: 'ltr' | 'rtl' } | null>(null);

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

    // Messages
    'msg.addedToCart': 'به سبد خرید اضافه شد!',
    'msg.orderPlaced': 'سفارش با موفقیت ثبت شد!',
    'msg.profileUpdated': 'پروفایل با موفقیت به‌روزرسانی شد!',
    'msg.passwordChanged': 'رمز عبور با موفقیت تغییر کرد!',
    'msg.addressAdded': 'آدرس با موفقیت اضافه شد!',
    'msg.reviewSubmitted': 'نظر با موفقیت ثبت شد!',
    'msg.subscribed': 'با موفقیت عضو شدید!',
    'msg.contactSent': 'پیام شما ارسال شد! در عرض ۲۴ ساعت پاسخ می‌دهیم.',
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

    // Messages
    'msg.addedToCart': 'Sepete eklendi!',
    'msg.orderPlaced': 'Sipariş başarıyla tamamlandı!',
    'msg.profileUpdated': 'Profil başarıyla güncellendi!',
    'msg.passwordChanged': 'Şifre başarıyla değiştirildi!',
    'msg.addressAdded': 'Adres başarıyla eklendi!',
    'msg.reviewSubmitted': 'Değerlendirmeniz gönderildi!',
    'msg.subscribed': 'Başarıyla abone oldunuz!',
    'msg.contactSent': 'Mesajınız gönderildi! 24 saat içinde yanıtlayacağız.',
  },
};

/** The per-language dictionaries, keyed by locale code. */
export const translations = dictionaries;

/** Every translation key in the English (source) dictionary, sorted. */
export const allTranslationKeys = Object.keys(translations.en).sort();

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
  // Seed with the locale the server already resolved for this request
  // (passed in by AppShell). Before the i18n hook reads from localStorage
  // and the browser, the first render matches the server-rendered
  // <html lang dir>, so there is no flash of LTR/English on hydration.
  // The context is read inside this hook (not in a module-scope helper)
  // because useContext is only legal inside a component or another hook.
  const seed = useContext(I18nSeedContext);
  const [language, setLanguage] = useState<string>(seed?.lang ?? 'en');
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(seed?.dir ?? 'ltr');

  useEffect(() => {
    // When the server has already resolved a locale for us, trust it.
    // Local visitors' last-chosen language currently lives in
    // localStorage (not a cookie), so the server can't see it. If we
    // rehydrated from localStorage on every mount we'd undo the SSR
    // seed for a returning user who happened to land on a different
    // device or a fresh browser profile. The cookie migration is a
    // separate task; until then, the seed wins.
    if (seed) {
      document.documentElement.dir = seed.dir;
      document.documentElement.lang = seed.lang;
      return;
    }
    const lang = getBrowserLanguage();
    setLanguage(lang);

    const langConfig = languages.find(l => l.code === lang);
    setDirection((langConfig?.dir as 'ltr' | 'rtl') || 'ltr');

    // Set document direction
    document.documentElement.dir = langConfig?.dir || 'ltr';
    document.documentElement.lang = lang;
  }, [seed]);

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
