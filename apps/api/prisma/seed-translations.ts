// ---------------------------------------------------------------------------
// Multilingual mock content for every language the storefront supports.
//
// The store ships five locales (en, ku, ar, fa, tr - see
// SUPPORTED_CONTENT_LOCALES and apps/web/lib/i18n.ts) but seeded NO translated
// content at all. Every storefront read therefore fell back to the English
// columns, so switching language changed only the static UI chrome while all
// product names, category names, page bodies and blog posts stayed English.
// There was nothing to demo, and nothing to test the localize/overlay path or
// the RTL layout against.
//
// This module writes ContentTranslation rows for the four translatable entity
// types (product, category, page, blogPost).
//
// Conventions that matter here
// ----------------------------
//  * English is the FALLBACK language. `localizeRow` returns the row untouched
//    when the requested locale equals the fallback, and the writer refuses
//    'en', so storing an English translation row is meaningless. We seed the
//    four non-English locales only.
//  * Only keys in TRANSLATABLE_FIELDS are persisted; anything else is dropped
//    on write and never overlaid on read. We stay inside that set.
//  * ku / ar / fa are RTL. The copy below is real script (Sorani Kurdish,
//    Arabic, Persian), not transliteration, so the RTL rendering, the
//    Arabic-script webfonts and the Unicode slug handling all get exercised.
//  * Numerals are left as Western digits to match how the storefront formats
//    prices; only prose is translated.
// ---------------------------------------------------------------------------

import { PrismaClient } from '@prisma/client';
import {
  CONTENT_ENTITY_TYPES,
  ContentEntityType,
  SUPPORTED_CONTENT_LOCALES,
  TRANSLATABLE_FIELDS,
  filterTranslatableFields,
} from '../src/modules/contentTranslations/translatableFields';

/** The locales we actually write rows for: everything except the fallback. */
export const FALLBACK_LOCALE = 'en';
export const TRANSLATED_LOCALES = SUPPORTED_CONTENT_LOCALES.filter(
  (l) => l !== FALLBACK_LOCALE,
);

type LocaleMap = Record<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// Products - keyed by the slug used in seed.ts.
// Fields: name, description, shortDescription, metaTitle, metaDescription.
// ---------------------------------------------------------------------------

export const PRODUCT_TRANSLATIONS: Record<string, LocaleMap> = {
  'iphone-15-pro': {
    ku: {
      name: 'ئایفۆن ١٥ پرۆ',
      description:
        'ئایفۆنی ١٥ پرۆ بە چوارچێوەی تیتانیۆم، سکرینی سوپەر ڕەتینا XDR و پرۆسێسەری A17 Pro. کامێرای پێشکەوتوو بۆ وێنەی پیشەیی.',
      shortDescription: 'ئایفۆنی نوێ بە چوارچێوەی تیتانیۆم',
      metaTitle: 'ئایفۆن ١٥ پرۆ بکڕە | کڕینی ئۆنلاین',
      metaDescription: 'ئایفۆن ١٥ پرۆ بە باشترین نرخ، گەیاندنی خێرا و گەرەنتی فەرمی.',
    },
    ar: {
      name: 'آيفون ١٥ برو',
      description:
        'آيفون 15 برو بإطار من التيتانيوم وشاشة Super Retina XDR ومعالج A17 Pro. كاميرا احترافية لالتقاط صور مذهلة.',
      shortDescription: 'آيفون جديد بإطار من التيتانيوم',
      metaTitle: 'اشترِ آيفون ١٥ برو | التسوق عبر الإنترنت',
      metaDescription: 'آيفون 15 برو بأفضل سعر مع شحن سريع وضمان رسمي.',
    },
    fa: {
      name: 'آیفون ۱۵ پرو',
      description:
        'آیفون ۱۵ پرو با بدنه تیتانیومی، نمایشگر Super Retina XDR و تراشه A17 Pro. دوربین حرفه‌ای برای عکس‌های بی‌نظیر.',
      shortDescription: 'آیفون جدید با بدنه تیتانیومی',
      metaTitle: 'خرید آیفون ۱۵ پرو | فروشگاه اینترنتی',
      metaDescription: 'آیفون ۱۵ پرو با بهترین قیمت، ارسال سریع و گارانتی رسمی.',
    },
    tr: {
      name: 'iPhone 15 Pro',
      description:
        'Titanyum gövdeli iPhone 15 Pro, Super Retina XDR ekran ve A17 Pro çip ile geliyor. Profesyonel fotoğraflar için gelişmiş kamera sistemi.',
      shortDescription: 'Titanyum gövdeli yeni iPhone',
      metaTitle: 'iPhone 15 Pro Satın Al | Online Mağaza',
      metaDescription: 'iPhone 15 Pro en iyi fiyatla, hızlı kargo ve resmi garanti ile.',
    },
  },

  'macbook-pro-14': {
    ku: {
      name: 'مێکبووک پرۆ ١٤ ئینچ',
      description:
        'مێکبووک پرۆی ١٤ ئینچی بە پرۆسێسەری M3 Pro، سکرینی Liquid Retina XDR و باتریەکی بەهێز بۆ ڕۆژێکی تەواوی کار.',
      shortDescription: 'لاپتۆپی پیشەیی بۆ کاری قورس',
      metaTitle: 'مێکبووک پرۆ ١٤ ئینچ بکڕە',
      metaDescription: 'مێکبووک پرۆ بە پرۆسێسەری M3 Pro، گەیاندنی خێرا بۆ هەموو شوێنێک.',
    },
    ar: {
      name: 'ماك بوك برو ١٤ إنش',
      description:
        'ماك بوك برو مقاس 14 إنش بمعالج M3 Pro وشاشة Liquid Retina XDR وبطارية تدوم طوال يوم العمل.',
      shortDescription: 'حاسوب محمول احترافي للمهام الثقيلة',
      metaTitle: 'اشترِ ماك بوك برو ١٤ إنش',
      metaDescription: 'ماك بوك برو بمعالج M3 Pro مع شحن سريع إلى جميع المناطق.',
    },
    fa: {
      name: 'مک‌بوک پرو ۱۴ اینچ',
      description:
        'مک‌بوک پرو ۱۴ اینچ با تراشه M3 Pro، نمایشگر Liquid Retina XDR و باتری قدرتمند برای یک روز کاری کامل.',
      shortDescription: 'لپ‌تاپ حرفه‌ای برای کارهای سنگین',
      metaTitle: 'خرید مک‌بوک پرو ۱۴ اینچ',
      metaDescription: 'مک‌بوک پرو با تراشه M3 Pro و ارسال سریع به سراسر کشور.',
    },
    tr: {
      name: 'MacBook Pro 14 inç',
      description:
        '14 inç MacBook Pro, M3 Pro çip, Liquid Retina XDR ekran ve tüm iş gününe yetecek güçlü bataryayla geliyor.',
      shortDescription: 'Ağır işler için profesyonel dizüstü',
      metaTitle: 'MacBook Pro 14 inç Satın Al',
      metaDescription: 'M3 Pro çipli MacBook Pro, hızlı kargo ile kapınızda.',
    },
  },

  'web-development-course': {
    ku: {
      name: 'کۆرسی گەشەپێدانی وێب',
      description:
        'کۆرسێکی تەواو بۆ فێربوونی گەشەپێدانی وێب لە سفرەوە: HTML، CSS، JavaScript، React و Node.js بە پرۆژەی پراکتیکی.',
      shortDescription: 'کۆرسی ئۆنلاین بۆ فێربوونی وێب',
      metaTitle: 'کۆرسی گەشەپێدانی وێب | فێربوونی ئۆنلاین',
      metaDescription: 'فێری گەشەپێدانی وێب ببە بە کۆرسێکی پراکتیکی و تەواو.',
    },
    ar: {
      name: 'دورة تطوير الويب',
      description:
        'دورة شاملة لتعلم تطوير الويب من الصفر: HTML وCSS وJavaScript وReact وNode.js مع مشاريع تطبيقية.',
      shortDescription: 'دورة إلكترونية لتعلم تطوير الويب',
      metaTitle: 'دورة تطوير الويب | تعلّم عبر الإنترنت',
      metaDescription: 'تعلّم تطوير الويب من خلال دورة عملية وشاملة.',
    },
    fa: {
      name: 'دوره توسعه وب',
      description:
        'دوره‌ای جامع برای یادگیری توسعه وب از صفر: HTML، CSS، JavaScript، React و Node.js همراه با پروژه‌های عملی.',
      shortDescription: 'دوره آنلاین یادگیری توسعه وب',
      metaTitle: 'دوره توسعه وب | آموزش آنلاین',
      metaDescription: 'با یک دوره کاربردی و جامع، توسعه وب را یاد بگیرید.',
    },
    tr: {
      name: 'Web Geliştirme Kursu',
      description:
        'Sıfırdan web geliştirmeyi öğrenmek için kapsamlı kurs: HTML, CSS, JavaScript, React ve Node.js, uygulamalı projelerle.',
      shortDescription: 'Web geliştirme için online kurs',
      metaTitle: 'Web Geliştirme Kursu | Online Eğitim',
      metaDescription: 'Uygulamalı ve kapsamlı bir kursla web geliştirmeyi öğrenin.',
    },
  },

  'classic-t-shirt': {
    ku: {
      name: 'تیشێرتی کلاسیک',
      description: 'تیشێرتێکی ئاسوودەی پەمبووی بەردەست بە چەند ڕەنگێکی جیاواز. گونجاوە بۆ هەموو وەرزێک.',
      shortDescription: 'تیشێرتی پەمبووی ئاسوودە',
      metaTitle: 'تیشێرتی کلاسیک بکڕە',
      metaDescription: 'تیشێرتی پەمبوو بە کوالیتیی بەرز و نرخی گونجاو.',
    },
    ar: {
      name: 'تي شيرت كلاسيكي',
      description: 'تي شيرت قطني مريح متوفر بألوان متعددة. مناسب لجميع الفصول.',
      shortDescription: 'تي شيرت قطني مريح',
      metaTitle: 'اشترِ تي شيرت كلاسيكي',
      metaDescription: 'تي شيرت قطني بجودة عالية وسعر مناسب.',
    },
    fa: {
      name: 'تی‌شرت کلاسیک',
      description: 'تی‌شرت نخی راحت در رنگ‌های متنوع. مناسب برای تمام فصول.',
      shortDescription: 'تی‌شرت نخی راحت',
      metaTitle: 'خرید تی‌شرت کلاسیک',
      metaDescription: 'تی‌شرت نخی با کیفیت بالا و قیمت مناسب.',
    },
    tr: {
      name: 'Klasik Tişört',
      description: 'Birden fazla renkte sunulan rahat pamuklu tişört. Her mevsime uygun.',
      shortDescription: 'Rahat pamuklu tişört',
      metaTitle: 'Klasik Tişört Satın Al',
      metaDescription: 'Yüksek kaliteli ve uygun fiyatlı pamuklu tişört.',
    },
  },

  'javascript-good-parts': {
    ku: {
      name: 'JavaScript: بەشە باشەکان',
      description:
        'کتێبێکی بنەڕەتی دەربارەی JavaScript کە باسی ئەو بەشانە دەکات کە زمانەکە بەهێز دەکەن، لەگەڵ نموونەی ڕوون.',
      shortDescription: 'کتێبی کلاسیک دەربارەی JavaScript',
      metaTitle: 'کتێبی JavaScript: بەشە باشەکان',
      metaDescription: 'کتێبێکی پێویست بۆ هەر پەرەپێدەرێکی JavaScript.',
    },
    ar: {
      name: 'جافاسكريبت: الأجزاء الجيدة',
      description:
        'كتاب أساسي عن جافاسكريبت يشرح الأجزاء التي تجعل اللغة قوية، مع أمثلة واضحة وعملية.',
      shortDescription: 'كتاب كلاسيكي عن جافاسكريبت',
      metaTitle: 'كتاب جافاسكريبت: الأجزاء الجيدة',
      metaDescription: 'كتاب لا غنى عنه لكل مطوّر جافاسكريبت.',
    },
    fa: {
      name: 'جاوااسکریپت: بخش‌های خوب',
      description:
        'کتابی بنیادی درباره جاوااسکریپت که بخش‌های قدرتمند این زبان را با مثال‌های روشن توضیح می‌دهد.',
      shortDescription: 'کتاب کلاسیک درباره جاوااسکریپت',
      metaTitle: 'کتاب جاوااسکریپت: بخش‌های خوب',
      metaDescription: 'کتابی ضروری برای هر توسعه‌دهنده جاوااسکریپت.',
    },
    tr: {
      name: 'JavaScript: İyi Parçalar',
      description:
        'JavaScript hakkında temel bir kitap; dili güçlü kılan bölümleri açık ve uygulamalı örneklerle anlatır.',
      shortDescription: 'JavaScript üzerine klasik kitap',
      metaTitle: 'JavaScript: İyi Parçalar Kitabı',
      metaDescription: 'Her JavaScript geliştiricisi için vazgeçilmez bir kitap.',
    },
  },
};

// ---------------------------------------------------------------------------
// Categories - fields: name, description.
// ---------------------------------------------------------------------------

export const CATEGORY_TRANSLATIONS: Record<string, LocaleMap> = {
  general: {
    ku: { name: 'گشتی', description: 'بەرهەمە گشتییەکان' },
    ar: { name: 'عام', description: 'منتجات عامة' },
    fa: { name: 'عمومی', description: 'محصولات عمومی' },
    tr: { name: 'Genel', description: 'Genel ürünler' },
  },
  electronics: {
    ku: { name: 'ئەلیکترۆنیات', description: 'ئامێرە ئەلیکترۆنییەکان و ئامێری بیرکاری' },
    ar: { name: 'إلكترونيات', description: 'الأجهزة الإلكترونية والحواسيب' },
    fa: { name: 'الکترونیک', description: 'دستگاه‌های الکترونیکی و رایانه‌ها' },
    tr: { name: 'Elektronik', description: 'Elektronik cihazlar ve bilgisayarlar' },
  },
  clothing: {
    ku: { name: 'جلوبەرگ', description: 'جل و بەرگی پیاوان و ژنان' },
    ar: { name: 'ملابس', description: 'ملابس رجالية ونسائية' },
    fa: { name: 'پوشاک', description: 'پوشاک مردانه و زنانه' },
    tr: { name: 'Giyim', description: 'Erkek ve kadın giyim' },
  },
  books: {
    ku: { name: 'کتێب', description: 'کتێبی چاپکراو و ئەلیکترۆنی' },
    ar: { name: 'كتب', description: 'كتب مطبوعة وإلكترونية' },
    fa: { name: 'کتاب', description: 'کتاب‌های چاپی و الکترونیکی' },
    tr: { name: 'Kitaplar', description: 'Basılı ve elektronik kitaplar' },
  },
  'digital-products': {
    ku: { name: 'بەرهەمی دیجیتاڵ', description: 'بەرهەمی دابەزاندنی ڕاستەوخۆ' },
    ar: { name: 'منتجات رقمية', description: 'منتجات قابلة للتنزيل مباشرة' },
    fa: { name: 'محصولات دیجیتال', description: 'محصولات قابل دانلود' },
    tr: { name: 'Dijital Ürünler', description: 'Anında indirilebilir ürünler' },
  },
};

// ---------------------------------------------------------------------------
// CMS pages and blog posts.
//
// `content` renders as HTML (HTML_RENDERED_FIELDS), so it is sanitized on both
// write and read. Keeping the markup to a simple <p>/<h2>/<ul> allow-list means
// what we seed is exactly what renders - a good sanity check on that pipeline.
// ---------------------------------------------------------------------------

export const PAGE_TRANSLATIONS: Record<string, LocaleMap> = {
  'our-story': {
    ku: {
      title: 'دەربارەی ئێمە',
      excerpt: 'ئێمە کێین و چی دەکەین',
      content:
        '<h2>دەربارەی ئێمە</h2><p>ئێمە فرۆشگایەکی ئۆنلاینین کە بەرهەمی جۆراوجۆر بە باشترین نرخ پێشکەش دەکەین. ئامانجمان دابینکردنی خزمەتگوزاریەکی خێرا و متمانەپێکراوە.</p>',
      metaTitle: 'دەربارەی ئێمە | فرۆشگا',
      metaDescription: 'زانیاری دەربارەی فرۆشگاکەمان و خزمەتگوزارییەکانمان.',
    },
    ar: {
      title: 'من نحن',
      excerpt: 'من نحن وماذا نقدم',
      content:
        '<h2>من نحن</h2><p>نحن متجر إلكتروني نقدّم منتجات متنوعة بأفضل الأسعار. هدفنا تقديم خدمة سريعة وموثوقة لجميع عملائنا.</p>',
      metaTitle: 'من نحن | المتجر',
      metaDescription: 'معلومات عن متجرنا والخدمات التي نقدمها.',
    },
    fa: {
      title: 'درباره ما',
      excerpt: 'ما که هستیم و چه می‌کنیم',
      content:
        '<h2>درباره ما</h2><p>ما یک فروشگاه اینترنتی هستیم که محصولات متنوعی را با بهترین قیمت ارائه می‌دهد. هدف ما ارائه خدماتی سریع و قابل اعتماد است.</p>',
      metaTitle: 'درباره ما | فروشگاه',
      metaDescription: 'اطلاعاتی درباره فروشگاه ما و خدماتی که ارائه می‌دهیم.',
    },
    tr: {
      title: 'Hakkımızda',
      excerpt: 'Biz kimiz ve ne yapıyoruz',
      content:
        '<h2>Hakkımızda</h2><p>Çeşitli ürünleri en iyi fiyatlarla sunan bir online mağazayız. Amacımız tüm müşterilerimize hızlı ve güvenilir bir hizmet sağlamaktır.</p>',
      metaTitle: 'Hakkımızda | Mağaza',
      metaDescription: 'Mağazamız ve sunduğumuz hizmetler hakkında bilgi.',
    },
  },
  'delivery-information': {
    ku: {
      title: 'سیاسەتی گەیاندن',
      excerpt: 'زانیاری دەربارەی گەیاندن',
      content:
        '<h2>سیاسەتی گەیاندن</h2><p>داواکارییەکان لە ماوەی ١ تا ٢ ڕۆژی کاردا ئامادە دەکرێن.</p><ul><li>گەیاندنی ئاسایی: ٣ تا ٧ ڕۆژ</li><li>گەیاندنی خێرا: ١ تا ٢ ڕۆژ</li></ul>',
      metaTitle: 'سیاسەتی گەیاندن',
      metaDescription: 'هەموو زانیارییەک دەربارەی گەیاندن و ماوەکانی.',
    },
    ar: {
      title: 'سياسة الشحن',
      excerpt: 'معلومات عن الشحن',
      content:
        '<h2>سياسة الشحن</h2><p>يتم تجهيز الطلبات خلال يوم إلى يومي عمل.</p><ul><li>الشحن العادي: 3 إلى 7 أيام</li><li>الشحن السريع: 1 إلى 2 يوم</li></ul>',
      metaTitle: 'سياسة الشحن',
      metaDescription: 'كل ما تحتاج معرفته عن الشحن ومدده.',
    },
    fa: {
      title: 'سیاست ارسال',
      excerpt: 'اطلاعات مربوط به ارسال',
      content:
        '<h2>سیاست ارسال</h2><p>سفارش‌ها ظرف ۱ تا ۲ روز کاری آماده می‌شوند.</p><ul><li>ارسال عادی: ۳ تا ۷ روز</li><li>ارسال سریع: ۱ تا ۲ روز</li></ul>',
      metaTitle: 'سیاست ارسال',
      metaDescription: 'هر آنچه باید درباره ارسال و زمان‌بندی آن بدانید.',
    },
    tr: {
      title: 'Kargo Politikası',
      excerpt: 'Kargo hakkında bilgi',
      content:
        '<h2>Kargo Politikası</h2><p>Siparişler 1-2 iş günü içinde hazırlanır.</p><ul><li>Standart kargo: 3-7 gün</li><li>Hızlı kargo: 1-2 gün</li></ul>',
      metaTitle: 'Kargo Politikası',
      metaDescription: 'Kargo ve teslimat süreleri hakkında bilmeniz gereken her şey.',
    },
  },
};

export const BLOG_TRANSLATIONS: Record<string, LocaleMap> = {
  'welcome-to-our-store': {
    ku: {
      title: 'بەخێربێن بۆ فرۆشگاکەمان',
      excerpt: 'دەستپێکردن لەگەڵ فرۆشگای ئۆنلاینەکەمان',
      content:
        '<p>بەخێربێن! لەم بابەتەدا باس لەوە دەکەین چۆن دەتوانیت بە ئاسانی کڕین بکەیت و سوود لە داشکاندنەکان وەربگریت.</p>',
      metaTitle: 'بەخێربێن بۆ فرۆشگاکەمان',
      metaDescription: 'ڕێنمایی دەستپێک بۆ کڕین لە فرۆشگای ئۆنلاینەکەمان.',
    },
    ar: {
      title: 'مرحبًا بكم في متجرنا',
      excerpt: 'ابدأ التسوق في متجرنا الإلكتروني',
      content:
        '<p>مرحبًا بكم! في هذه المقالة نشرح كيف يمكنك الشراء بسهولة والاستفادة من العروض والخصومات.</p>',
      metaTitle: 'مرحبًا بكم في متجرنا',
      metaDescription: 'دليل البداية للتسوق في متجرنا الإلكتروني.',
    },
    fa: {
      title: 'به فروشگاه ما خوش آمدید',
      excerpt: 'شروع خرید از فروشگاه اینترنتی ما',
      content:
        '<p>خوش آمدید! در این مطلب توضیح می‌دهیم چگونه به‌راحتی خرید کنید و از تخفیف‌ها بهره‌مند شوید.</p>',
      metaTitle: 'به فروشگاه ما خوش آمدید',
      metaDescription: 'راهنمای شروع خرید از فروشگاه اینترنتی ما.',
    },
    tr: {
      title: 'Mağazamıza Hoş Geldiniz',
      excerpt: 'Online mağazamızda alışverişe başlayın',
      content:
        '<p>Hoş geldiniz! Bu yazıda kolayca nasıl alışveriş yapabileceğinizi ve indirimlerden nasıl yararlanacağınızı anlatıyoruz.</p>',
      metaTitle: 'Mağazamıza Hoş Geldiniz',
      metaDescription: 'Online mağazamızda alışverişe başlangıç rehberi.',
    },
  },
};

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/** Look up rows by slug and return a slug -> id map for the ones that exist. */
async function idsBySlug(
  prisma: PrismaClient,
  model: 'product' | 'category' | 'page' | 'blogPost',
  slugs: string[],
): Promise<Record<string, string>> {
  const delegate = (prisma as unknown as Record<string, any>)[model];
  const rows: Array<{ id: string; slug: string }> = await delegate.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  return Object.fromEntries(rows.map((r) => [r.slug, r.id]));
}

/**
 * Upsert the translation rows for one entity type.
 *
 * Upsert (not create) so re-running the seed refreshes the copy instead of
 * exploding on the @@unique([entityType, entityId, locale]) constraint.
 */
async function writeFor(
  prisma: PrismaClient,
  entityType: ContentEntityType,
  model: 'product' | 'category' | 'page' | 'blogPost',
  table: Record<string, LocaleMap>,
): Promise<{ written: number; missing: string[] }> {
  const slugs = Object.keys(table);
  if (slugs.length === 0) return { written: 0, missing: [] };

  const ids = await idsBySlug(prisma, model, slugs);
  const missing = slugs.filter((s) => !ids[s]);
  let written = 0;

  for (const [slug, byLocale] of Object.entries(table)) {
    const entityId = ids[slug];
    // A slug that isn't in the database is not an error: the CMS pages and
    // blog posts are optional fixtures, and a store may have deleted a demo
    // product. Skip and report rather than failing the whole seed.
    if (!entityId) continue;

    for (const locale of TRANSLATED_LOCALES) {
      const fields = byLocale[locale];
      if (!fields) continue;

      // Run the payload through the same filter the API write path uses, so
      // this fixture can never seed a key the storefront would drop.
      const data = filterTranslatableFields(entityType, fields);
      if (Object.keys(data).length === 0) continue;

      await prisma.contentTranslation.upsert({
        where: { entityType_entityId_locale: { entityType, entityId, locale } },
        update: { data: JSON.stringify(data) },
        create: { entityType, entityId, locale, data: JSON.stringify(data) },
      });
      written++;
    }
  }

  return { written, missing };
}

/**
 * Seed multilingual content for every supported locale.
 *
 * Idempotent: safe to run against an already-seeded database.
 */
export async function seedContentTranslations(prisma: PrismaClient): Promise<number> {
  const results = await Promise.all([
    writeFor(prisma, 'product', 'product', PRODUCT_TRANSLATIONS),
    writeFor(prisma, 'category', 'category', CATEGORY_TRANSLATIONS),
    writeFor(prisma, 'page', 'page', PAGE_TRANSLATIONS),
    writeFor(prisma, 'blogPost', 'blogPost', BLOG_TRANSLATIONS),
  ]);

  const total = results.reduce((sum, r) => sum + r.written, 0);
  const skipped = results.flatMap((r) => r.missing);

  console.log(
    `   - Translations: ${total} row(s) across ${TRANSLATED_LOCALES.length} locales (${TRANSLATED_LOCALES.join(', ')})`,
  );
  if (skipped.length > 0) {
    console.log(`     (no matching row for: ${skipped.join(', ')} - skipped)`);
  }

  return total;
}

/** Exported for tests: every entity type the fixtures cover. */
export const FIXTURE_TABLES: Record<ContentEntityType, Record<string, LocaleMap>> = {
  product: PRODUCT_TRANSLATIONS,
  category: CATEGORY_TRANSLATIONS,
  page: PAGE_TRANSLATIONS,
  blogPost: BLOG_TRANSLATIONS,
};

export { CONTENT_ENTITY_TYPES, TRANSLATABLE_FIELDS };
