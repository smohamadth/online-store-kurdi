import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedEmailTemplates } from './seed-email-templates';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.searchQuery.deleteMany();
  await prisma.recommendationLog.deleteMany();
  await prisma.productSimilarity.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.productEmbedding.deleteMany();
  await prisma.userEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.session.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
  await prisma.coupon.deleteMany();

  console.log('🧹 Cleaned existing data');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@store.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isActive: true,
      isVerified: true,
    },
  });

  // Create test customer
  const customerPassword = await bcrypt.hash('customer123', 12);
  const customer = await prisma.user.create({
    data: {
      email: 'customer@example.com',
      password: customerPassword,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      role: 'customer',
      isActive: true,
      isVerified: true,
      addresses: {
        create: [
          {
            type: 'shipping',
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
            phone: '+1234567890',
            isDefault: true,
          },
        ],
      },
    },
  });

  console.log('👥 Created users');

  // Create categories
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Electronics',
        slug: 'electronics',
        description: 'Electronic devices and accessories',
        image: '/images/categories/electronics.jpg',
        sortOrder: 1,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Clothing',
        slug: 'clothing',
        description: 'Fashion and apparel',
        image: '/images/categories/clothing.jpg',
        sortOrder: 2,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Books',
        slug: 'books',
        description: 'Physical and digital books',
        image: '/images/categories/books.jpg',
        sortOrder: 3,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Digital Products',
        slug: 'digital-products',
        description: 'Software, courses, and digital content',
        image: '/images/categories/digital.jpg',
        sortOrder: 4,
      },
    }),
  ]);

  console.log('📁 Created categories');

  // Create products
  const products = await Promise.all([
    // Physical products
    prisma.product.create({
      data: {
        name: 'iPhone 15 Pro',
        slug: 'iphone-15-pro',
        description: 'The latest iPhone with A17 Pro chip, titanium design, and advanced camera system.',
        shortDescription: 'Latest iPhone with A17 Pro chip',
        sku: 'IPHONE-15-PRO',
        type: 'physical',
        status: 'active',
        price: 999.99,
        compareAtPrice: 1099.99,
        quantity: 100,
        categoryId: categories[0].id,
        metaTitle: 'iPhone 15 Pro - Buy Now | Your Store',
        metaDescription: 'Get the latest iPhone 15 Pro with A17 Pro chip and titanium design.',
        metaKeywords: JSON.stringify(['iphone', 'apple', 'smartphone', 'mobile']),
        images: {
          create: [
            {
              url: '/images/products/iphone-15-pro-1.jpg',
              alt: 'iPhone 15 Pro front view',
              isPrimary: true,
              sortOrder: 1,
            },
            {
              url: '/images/products/iphone-15-pro-2.jpg',
              alt: 'iPhone 15 Pro back view',
              sortOrder: 2,
            },
          ],
        },
        variants: {
          create: [
            {
              name: '128GB - Natural Titanium',
              sku: 'IPHONE-15-PRO-128-NT',
              price: 999.99,
              quantity: 30,
              attributes: JSON.stringify({ storage: '128GB', color: 'Natural Titanium' }),
            },
            {
              name: '256GB - Natural Titanium',
              sku: 'IPHONE-15-PRO-256-NT',
              price: 1099.99,
              quantity: 25,
              attributes: JSON.stringify({ storage: '256GB', color: 'Natural Titanium' }),
            },
          ],
        },
      },
    }),

    prisma.product.create({
      data: {
        name: 'MacBook Pro 14"',
        slug: 'macbook-pro-14',
        description: 'Powerful laptop with M3 chip, Liquid Retina XDR display, and all-day battery life.',
        shortDescription: 'Professional laptop with M3 chip',
        sku: 'MACBOOK-PRO-14',
        type: 'physical',
        status: 'active',
        price: 1599.99,
        quantity: 50,
        categoryId: categories[0].id,
        metaTitle: 'MacBook Pro 14" - Professional Laptop | Your Store',
        metaDescription: 'Buy MacBook Pro 14" with M3 chip. Perfect for professionals.',
        metaKeywords: JSON.stringify(['macbook', 'apple', 'laptop', 'professional']),
        images: {
          create: [
            {
              url: '/images/products/macbook-pro-14-1.jpg',
              alt: 'MacBook Pro 14 inch',
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
      },
    }),

    // Digital product
    prisma.product.create({
      data: {
        name: 'Web Development Course',
        slug: 'web-development-course',
        description: 'Complete web development course covering HTML, CSS, JavaScript, React, and Node.js.',
        shortDescription: 'Learn web development from scratch',
        sku: 'COURSE-WEB-DEV',
        type: 'digital',
        status: 'active',
        price: 49.99,
        compareAtPrice: 99.99,
        categoryId: categories[3].id,
        downloadLimit: 5,
        downloadExpiry: 365,
        metaTitle: 'Web Development Course - Learn to Code | Your Store',
        metaDescription: 'Master web development with our comprehensive course.',
        metaKeywords: JSON.stringify(['web development', 'course', 'programming', 'javascript']),
        images: {
          create: [
            {
              url: '/images/products/web-dev-course.jpg',
              alt: 'Web Development Course',
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
      },
    }),

    prisma.product.create({
      data: {
        name: 'Classic T-Shirt',
        slug: 'classic-t-shirt',
        description: 'Comfortable cotton t-shirt available in multiple colors.',
        shortDescription: 'Comfortable cotton t-shirt',
        sku: 'TSHIRT-CLASSIC',
        type: 'physical',
        status: 'active',
        price: 29.99,
        quantity: 200,
        categoryId: categories[1].id,
        images: {
          create: [
            {
              url: '/images/products/t-shirt-1.jpg',
              alt: 'Classic T-Shirt',
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
        variants: {
          create: [
            {
              name: 'Small - Black',
              sku: 'TSHIRT-CLASSIC-S-BK',
              price: 29.99,
              quantity: 50,
              attributes: JSON.stringify({ size: 'S', color: 'Black' }),
            },
            {
              name: 'Medium - Black',
              sku: 'TSHIRT-CLASSIC-M-BK',
              price: 29.99,
              quantity: 75,
              attributes: JSON.stringify({ size: 'M', color: 'Black' }),
            },
          ],
        },
      },
    }),

    prisma.product.create({
      data: {
        name: 'JavaScript: The Good Parts',
        slug: 'javascript-good-parts',
        description: 'A classic book about JavaScript programming by Douglas Crockford.',
        shortDescription: 'Classic JavaScript programming book',
        sku: 'BOOK-JS-GOOD-PARTS',
        type: 'physical',
        status: 'active',
        price: 24.99,
        quantity: 150,
        categoryId: categories[2].id,
        images: {
          create: [
            {
              url: '/images/products/js-good-parts.jpg',
              alt: 'JavaScript: The Good Parts book cover',
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
      },
    }),
  ]);

  console.log('📦 Created products');

  // Create sample reviews
  await prisma.review.createMany({
    data: [
      {
        userId: customer.id,
        productId: products[0].id,
        rating: 5,
        title: 'Amazing phone!',
        comment: 'The camera quality is incredible and the performance is outstanding.',
        isVerified: true,
        isApproved: true,
      },
      {
        userId: customer.id,
        productId: products[1].id,
        rating: 5,
        title: 'Best laptop ever',
        comment: 'Perfect for development work. The M3 chip is blazing fast.',
        isVerified: true,
        isApproved: true,
      },
      {
        userId: customer.id,
        productId: products[2].id,
        rating: 4,
        title: 'Great course for beginners',
        comment: 'Very comprehensive course. Helped me land my first dev job!',
        isVerified: true,
        isApproved: true,
      },
    ],
  });

  console.log('⭐ Created reviews');

  // Create sample coupons
  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        type: 'percentage',
        value: 10,
        minOrderAmount: 50,
        usageLimit: 100,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      {
        code: 'SAVE20',
        type: 'fixed',
        value: 20,
        minOrderAmount: 100,
        usageLimit: 50,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log('🎟️ Created coupons');

  // Create sample user events for analytics
  const eventTypes = ['view', 'click', 'add_to_cart', 'purchase', 'search', 'wishlist'];
  
  for (let i = 0; i < 50; i++) {
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    const randomEventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    await prisma.userEvent.create({
      data: {
        userId: Math.random() > 0.3 ? customer.id : null,
        sessionId: `session-${Math.random().toString(36).substr(2, 9)}`,
        eventType: randomEventType,
        productId: randomEventType !== 'search' ? randomProduct.id : null,
        searchQuery: randomEventType === 'search' ? 'javascript tutorial' : null,
        metadata: JSON.stringify({
          page: `/products/${randomProduct.slug}`,
          referrer: 'google',
        }),
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
      },
    });
  }

  console.log('📊 Created sample analytics events');

  // Seed email templates
  await seedEmailTemplates();

  console.log('✅ Database seeded successfully!');
  console.log('\n📋 Summary:');
  console.log(`   - Users: 2 (admin@store.com / admin123, customer@example.com / customer123)`);
  console.log(`   - Categories: ${categories.length}`);
  console.log(`   - Products: ${products.length}`);
  console.log(`   - Reviews: 3`);
  console.log(`   - Coupons: 2`);
  console.log(`   - Analytics events: 50`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });