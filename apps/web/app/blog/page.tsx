import type { Metadata } from 'next';
import Link from 'next/link';
import { API_BASE } from '@/lib/apiBase';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import { BlogPost, BlogPagination, formatPostDate } from '@/lib/blog';
import BlogSearch from '@/components/BlogSearch';
import PostCard from '@/components/PostCard';

/**
 * Blog index at /blog.
 *
 * A SERVER component: the whole point of a blog is search traffic, so the post
 * list must be in the initial HTML rather than appearing after hydration.
 * Filtering is driven by the query string (?page=&tag=&search=) so every view
 * is a real, shareable, crawlable URL.
 *
 * API_BASE comes from lib/apiBase, NOT lib/http — the latter is 'use client'.
 */

export const dynamic = 'force-dynamic';

interface Search {
  page?: string;
  tag?: string;
  search?: string;
}

async function getPosts(sp: Search): Promise<{ posts: BlogPost[]; pagination: BlogPagination }> {
  const qs = new URLSearchParams();
  if (sp.page) qs.set('page', sp.page);
  if (sp.tag) qs.set('tag', sp.tag);
  if (sp.search) qs.set('search', sp.search);
  qs.set('limit', '9');

  const empty = { posts: [], pagination: { page: 1, limit: 9, total: 0, totalPages: 1 } };
  try {
    const res = await fetch(`${API_BASE}/blog?${qs}`, { cache: 'no-store' });
    if (!res.ok) return empty;
    const json = await res.json();
    return { posts: json.data || [], pagination: json.pagination || empty.pagination };
  } catch {
    // API down: render the shell with an explanation rather than a crash.
    return empty;
  }
}

async function getTags(): Promise<{ tag: string; count: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/blog/tags`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()).data || [];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const store = await getStoreInfo();
  const tag = searchParams.tag?.trim();

  const title = tag
    ? `Posts tagged “${tag}” | ${store.storeName}`
    : `Blog | ${store.storeName}`;

  return buildMetadata({
    title,
    description: tag
      ? `Articles about ${tag} from ${store.storeName}.`
      : `News, guides and updates from ${store.storeName}.`,
    path: tag ? `/blog?tag=${encodeURIComponent(tag)}` : '/blog',
    storeName: store.storeName,
    // Paginated and searched views must not compete with /blog in the index.
    index: !searchParams.page && !searchParams.search,
  });
}

export default async function BlogIndex({ searchParams }: { searchParams: Search }) {
  const [{ posts, pagination }, tags] = await Promise.all([
    getPosts(searchParams),
    getTags(),
  ]);

  const activeTag = searchParams.tag?.trim() || '';
  const activeSearch = searchParams.search?.trim() || '';

  const pageHref = (page: number) => {
    const qs = new URLSearchParams();
    if (activeTag) qs.set('tag', activeTag);
    if (activeSearch) qs.set('search', activeSearch);
    if (page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `/blog?${s}` : '/blog';
  };

  return (
    <div style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '48px 20px 72px' }}>
      <header style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontSize: '36px',
            fontWeight: 'var(--heading-weight, 800)' as any,
            letterSpacing: '-0.02em',
            color: 'var(--body-text, #111)',
          }}
        >
          Blog
        </h1>
        <p style={{ marginTop: '8px', color: 'var(--muted, #666)', fontSize: '16px' }}>
          News, guides and updates.
        </p>
      </header>

      <BlogSearch initialValue={activeSearch} tag={activeTag} />

      {/* Tag filter */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '18px 0 28px' }}>
          <Link
            href="/blog"
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid var(--border, #e5e5e5)',
              backgroundColor: activeTag ? 'var(--card-bg, #fff)' : 'var(--brand, #111)',
              color: activeTag ? 'var(--body-text, #111)' : 'var(--brand-text, #fff)',
            }}
          >
            All
          </Link>
          {tags.map((t) => {
            const on = t.tag === activeTag;
            return (
              <Link
                key={t.tag}
                href={`/blog?tag=${encodeURIComponent(t.tag)}`}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  border: '1px solid var(--border, #e5e5e5)',
                  backgroundColor: on ? 'var(--brand, #111)' : 'var(--card-bg, #fff)',
                  color: on ? 'var(--brand-text, #fff)' : 'var(--body-text, #111)',
                }}
              >
                {t.tag} <span style={{ opacity: 0.6 }}>({t.count})</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Results */}
      {posts.length === 0 ? (
        <div
          style={{
            padding: '64px 24px',
            textAlign: 'center',
            border: '1px dashed var(--border, #ddd)',
            borderRadius: 'var(--radius, 12px)',
            color: 'var(--muted, #666)',
          }}
        >
          <p style={{ fontWeight: 700, color: 'var(--body-text, #111)', fontSize: '18px' }}>
            {activeSearch || activeTag ? 'No matching posts' : 'No posts yet'}
          </p>
          <p style={{ marginTop: '8px', fontSize: '14px' }}>
            {activeSearch || activeTag
              ? 'Try a different search or tag.'
              : 'Check back soon — the first article is on its way.'}
          </p>
          {(activeSearch || activeTag) && (
            <Link
              href="/blog"
              style={{
                display: 'inline-block',
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: 'var(--brand, #111)',
                color: 'var(--brand-text, #fff)',
                borderRadius: 'var(--btn-radius, 8px)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Show all posts
            </Link>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '24px',
          }}
        >
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <nav
          aria-label="Blog pages"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '40px',
            flexWrap: 'wrap',
          }}
        >
          {pagination.page > 1 && (
            <Link href={pageHref(pagination.page - 1)} style={pagerStyle(false)}>
              ← Previous
            </Link>
          )}
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={pageHref(n)}
              aria-current={n === pagination.page ? 'page' : undefined}
              style={pagerStyle(n === pagination.page)}
            >
              {n}
            </Link>
          ))}
          {pagination.page < pagination.totalPages && (
            <Link href={pageHref(pagination.page + 1)} style={pagerStyle(false)}>
              Next →
            </Link>
          )}
        </nav>
      )}

      {pagination.total > 0 && (
        <p
          style={{
            textAlign: 'center',
            marginTop: '16px',
            fontSize: '13px',
            color: 'var(--muted, #888)',
          }}
        >
          {pagination.total} post{pagination.total === 1 ? '' : 's'}
          {activeTag ? ` tagged “${activeTag}”` : ''}
        </p>
      )}
    </div>
  );
}

function pagerStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: active ? 700 : 500,
    textDecoration: 'none',
    border: '1px solid var(--border, #e5e5e5)',
    backgroundColor: active ? 'var(--brand, #111)' : 'var(--card-bg, #fff)',
    color: active ? 'var(--brand-text, #fff)' : 'var(--body-text, #111)',
  };
}
