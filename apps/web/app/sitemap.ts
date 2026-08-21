import { MetadataRoute } from 'next';
import { serverFetch } from '@/lib/serverFetch';

/**
 * Regenerate on request rather than freezing at build time.
 *
 * Next prerendered this route statically, so the sitemap only ever contained
 * the products, categories, pages and posts that existed when the site was
 * BUILT. Anything published afterwards was invisible to search engines - which
 * defeats the point of a blog, where content is added continuously and the
 * whole return on the effort is search traffic.
 *
 * force-dynamic keeps it correct at the cost of one API round trip per
 * request; sitemaps are fetched rarely, by crawlers, so that is the right
 * trade.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yourstore.com';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/deals`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/track-order`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/returns`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  // Dynamic product pages
  let productPages: MetadataRoute.Sitemap = [];
  
  try {
    const response = await serverFetch('/products?limit=1000');
    if (response.ok) {
      const data = await response.json();
      const products = data.data || [];
      
      productPages = products.map((product: any) => ({
        url: `${baseUrl}/products/${product.slug}`,
        lastModified: new Date(product.updatedAt || product.createdAt),
        changeFrequency: 'weekly',
        priority: 0.8,
      }));
    }
  } catch (error) {
    // API not available during build
  }

  // Category pages - fetched from the API rather than hardcoded, so
  // categories the admin adds are included automatically.
  let categoryPages: MetadataRoute.Sitemap = [];
  try {
    const res = await serverFetch('/categories');
    if (res.ok) {
      const data = await res.json();
      categoryPages = (data.data || []).map((c: any) => ({
        url: `${baseUrl}/category/${c.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    }
  } catch {
    // API unavailable at build time - ship the sitemap without categories
    // rather than failing the whole build.
  }

    // Blog index + every published post. A blog exists to be found, so leaving
  // it out of the sitemap would defeat the point.
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const res = await serverFetch('/blog?limit=1000');
    if (res.ok) {
      const posts = (await res.json()).data || [];
      blogPages = [
        {
          url: `${baseUrl}/blog`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        },
        ...posts.map((p: any) => ({
          url: `${baseUrl}/blog/${p.slug}`,
          lastModified: new Date(p.updatedAt || p.publishedAt || p.createdAt),
          changeFrequency: 'monthly' as const,
          priority: 0.6,
        })),
      ];
    }
  } catch {
    // API unavailable at build time - ship without rather than fail the build.
  }

  // Admin-authored pages. These were added in the CMS work but never reached
  // the sitemap, so nothing was discovering them.
  let customPages: MetadataRoute.Sitemap = [];
  try {
    const res = await serverFetch('/pages');
    if (res.ok) {
      customPages = ((await res.json()).data || []).map((p: any) => ({
        url: `${baseUrl}/p/${p.slug}`,
        lastModified: new Date(p.updatedAt || Date.now()),
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }));
    }
  } catch {
    /* as above */
  }

  return [...staticPages, ...productPages, ...categoryPages, ...blogPages, ...customPages];
}
