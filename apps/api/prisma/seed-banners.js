#!/usr/bin/env node
/**
 * Seed the homepage gallery (hero slider + promo tiles).
 *
 * WHY THIS EXISTS
 * The HeroGallery component ships with hardcoded default slides so a brand new
 * install never renders an empty hero. But those defaults are NOT database
 * rows, so /admin/banners showed "No banners yet" while the homepage happily
 * displayed three slides. Editing was impossible - there was nothing to edit -
 * and the store owner reasonably concluded the gallery was broken.
 *
 * Running this once turns those phantom slides into real, editable records.
 *
 * Usage:
 *   node prisma/seed-banners.js          # insert only if the table is empty
 *   node prisma/seed-banners.js --force  # insert even if rows already exist
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FORCE = process.argv.includes('--force');

const BANNERS = [
  {
    title: 'Discover Amazing Products',
    subtitle: 'New Season',
    description:
      'Shop the latest electronics, clothing, books and digital products with fast shipping and great support.',
    image: '',
    linkUrl: '/products',
    buttonText: 'Shop Now',
    secondaryText: 'View Deals',
    secondaryUrl: '/deals',
    badge: 'Featured',
    overlayColor: 'linear-gradient(120deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)',
    position: 'hero',
    sortOrder: 0,
  },
  {
    title: 'Up to 50% Off Selected Items',
    subtitle: 'Limited Time',
    description: 'Grab the best deals of the season before they are gone.',
    image: '',
    linkUrl: '/deals',
    buttonText: 'Browse Deals',
    overlayColor: 'linear-gradient(120deg,#7f1d1d 0%,#b91c1c 55%,#f97316 100%)',
    position: 'hero',
    sortOrder: 1,
  },
  {
    title: 'Free Shipping On Orders Over 50',
    subtitle: 'Every Day',
    description: 'Fast, tracked delivery straight to your door.',
    image: '',
    linkUrl: '/products',
    buttonText: 'Start Shopping',
    overlayColor: 'linear-gradient(120deg,#064e3b 0%,#047857 60%,#10b981 100%)',
    position: 'hero',
    sortOrder: 2,
  },
  {
    title: 'New Arrivals',
    subtitle: 'Just In',
    image: '',
    linkUrl: '/products?sort=newest',
    buttonText: 'Explore',
    overlayColor: 'linear-gradient(120deg,#312e81,#6366f1)',
    position: 'promo',
    sortOrder: 0,
  },
  {
    title: 'Best Sellers',
    subtitle: 'Top Rated',
    image: '',
    linkUrl: '/products?sort=popular',
    buttonText: 'See All',
    overlayColor: 'linear-gradient(120deg,#7c2d12,#ea580c)',
    position: 'promo',
    sortOrder: 1,
  },
  {
    title: 'Clearance',
    subtitle: 'Final Sale',
    image: '',
    linkUrl: '/deals',
    buttonText: 'Save Now',
    overlayColor: 'linear-gradient(120deg,#0c4a6e,#0ea5e9)',
    position: 'promo',
    sortOrder: 2,
  },
];

async function main() {
  const existing = await prisma.banner.count();

  if (existing > 0 && !FORCE) {
    console.log(`✅ ${existing} banner(s) already exist - nothing to do.`);
    console.log('   Pass --force to add the defaults anyway.');
    return;
  }

  for (const data of BANNERS) {
    await prisma.banner.create({ data });
  }

  const total = await prisma.banner.count();
  console.log(`✅ Seeded ${BANNERS.length} banners (${total} total).`);
  console.log('   Edit them at /admin/banners → "Gallery & Banners".');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
