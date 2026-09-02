import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { API_BASE } from '@/lib/apiBase';
import { serverFetch } from '@/lib/serverFetch';
import { resolveRequestLocale } from '@/lib/serverLocale';
import { getStoreInfo, buildMetadata, SITE } from '@/lib/seo';
import { BlogPost, formatPostDate } from '@/lib/blog';
import PostViewCounter from '@/components/PostViewCounter';
import PostCard from '@/components/PostCard';
import ReadingProgress from '@/components/ReadingProgress';
import TableOfContents from '@/components/blog/TableOfContents';
import BlogSubscribe from '@/components/blog/BlogSubscribe';
import ShareButtons from '@/components/ShareButtons';
import { DirectionArrow } from '@/components/DirectionArrow';
import { PageBlocks } from '@/components/PageBlocks';
import { getServerPageLayout } from '@/lib/layouts/serverLayout';
import StaticLayoutRenderer from '@/components/StaticLayoutRenderer';
import { encodeRouteParam } from '@/lib/routeParam';
import { buildBlogPostingJsonLd, buildBreadcrumbJsonLd, asGraph } from '@/lib/structured-data';

/**
 * A single blog post at /blog/<slug>.
 *
 * SERVER component so the article body is in the initial HTML for crawlers,
 * and so an unknown or draft slug returns a REAL 404 — notFound() only sets
 * the status before the response is committed. /blog/:path* is registered in
 * middleware.ts alongside the other dynamic routes for the streaming case
 * described in KNOWN_GAPS.md section 7.
 */

/**
 * Fetch the post, or null when it definitively does not exist.
 *
 * Only the API's explicit 404 (or a 200 with no data) means "not found".
 * An unreachable or erroring API THROWS instead - collapsing those into null
 * rendered "Post not found" for posts that were published and fine. Callers
 * catch the throw and render a temporary-error view. See the matching change
 * in app/p/[slug]/page.tsx.
 */
async function getPost(slug: string): Promise<BlogPost | null> {
  let res: Response;
  try {
    // no-store: an edit must show on the next load, and a post pulled back to
    // draft must stop being served immediately.
    const { code } = await resolveRequestLocale();
    const lang = code === 'en' ? '' : `?lang=${code}`;
    res = await serverFetch(`/blog/slug/${encodeRouteParam(slug)}${lang}`, {
      cache: 'no-store',
    });
  } catch (err) {
    console.error(`[/blog/${slug}] store API unreachable:`, err);
    throw new Error('The store API is unreachable.');
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    console.error(`[/blog/${slug}] store API returned ${res.status}`);
    throw new Error(`Store API error (${res.status}).`);
  }

  const body = await res.json().catch(() => null);
  return body?.data || null;
}

function absolute(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace('/api', '')}${url}`;
}

/**
 * Where does a cover URL actually live?
 *
 * - http(s)/data URLs: as-is.
 * - /uploads/*: uploaded through the admin - served by the API (or MinIO),
 *   so it needs the API origin.
 * - anything else (e.g. the seeded /images/* assets): a web-app public
 *   asset - the web origin serves it. Same-origin relative URLs keep
 *   working in dev, proxied previews and single-origin deployments.
 */
function coverUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  if (url.startsWith('/uploads/')) return absolute(url);
  return url;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  // Tolerant on purpose - see getPost(). An upstream failure must not become
  // a false "Post not found" title while the body renders an error view.
  let post: BlogPost | null = null;
  let store: Awaited<ReturnType<typeof getStoreInfo>> | null = null;
  let upstream = false;
  try {
    [post, store] = await Promise.all([getPost(params.slug), getStoreInfo()]);
  } catch {
    upstream = true;
  }

  if (upstream) {
    return { title: 'Temporarily unavailable', robots: { index: false, follow: true } };
  }

  if (!post) {
    return { title: 'Post not found', robots: { index: false, follow: true } };
  }

  const storeInfo = store!;

  const description =
    post.metaDescription?.trim() ||
    post.excerpt?.trim() ||
    `${post.title} — ${storeInfo.storeName}`;

  const meta = buildMetadata({
    title: post.metaTitle?.trim() || `${post.title} | ${storeInfo.storeName}`,
    description,
    path: `/blog/${post.slug}`,
    storeName: storeInfo.storeName,
  });

  // OG/twitter image must be an absolute URL a crawler can fetch: uploaded
  // covers live on the API origin, web-public assets on the site origin.
  const cover = post.coverImage;
  const image =
    cover && (cover.startsWith('http') || cover.startsWith('data:'))
      ? cover
      : cover && cover.startsWith('/uploads/')
        ? absolute(cover)
        : cover
          ? `${SITE}${cover}`
          : undefined;

  return {
    ...meta,
    keywords: post.tags.length ? post.tags : undefined,
    openGraph: {
      ...meta.openGraph,
      // An article, not a generic website — this is what gives a post a proper
      // card with a date and author when shared.
      type: 'article',
      publishedTime: post.publishedAt || undefined,
      modifiedTime: post.updatedAt,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags,
      images: image ? [{ url: image, alt: post.title }] : undefined,
    },
    twitter: {
      ...meta.twitter,
      card: image ? 'summary_large_image' : 'summary',
      images: image ? [image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  // Only a definitive 404 shows "Post not found"; an upstream failure gets
  // an explicit temporary-error view (see getPost()).
  let post: BlogPost | null;
  try {
    post = await getPost(params.slug);
  } catch (err) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '72px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '44px' }}>⚠️</div>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 'var(--heading-weight, 800)' as any,
            marginTop: '14px',
            letterSpacing: '-0.02em',
          }}
        >
          This article could not be loaded
        </h1>
        <p
          style={{
            marginTop: '12px',
            fontSize: '16px',
            color: 'var(--muted, #666)',
            lineHeight: 1.6,
          }}
        >
          The store server failed to answer, so the article cannot be shown right now. It may well
          exist — this is a temporary error. Please try again in a moment.
        </p>
        {process.env.NODE_ENV !== 'production' && (
          <p style={{ marginTop: '14px', fontSize: '13px', color: '#999' }}>
            Technical detail: {err instanceof Error ? err.message : String(err)}
          </p>
        )}
      </div>
    );
  }

  if (!post) notFound();

  const store = await getStoreInfo();
  const image = coverUrl(post.coverImage);

  // Previous/next links in the blog feed. Best-effort: fetch the public
  // feed around this post and pick its date-sorted neighbours. Missing
  // neighbours (newest/oldest post, deep pagination) simply hide.
  const { code } = await resolveRequestLocale();
  const feedLang = code === 'en' ? '' : code;
  let neighbors: { older: NavPost | null; newer: NavPost | null } = { older: null, newer: null };
  try {
    neighbors = await getFeedNeighbors(post.slug, feedLang);
  } catch {
    // No navigation is better than a page that fails on it.
  }

  // Structured data: lets Google show the headline, date and image directly in
  // results. Cheap to emit and the main reason a blog earns traffic.
  // Built by the shared helper so this page and the unit test
  // can't drift on the field names.
  const jsonLd = buildBlogPostingJsonLd({
    url: `${SITE}/blog/${post.slug}`,
    headline: post.title,
    description: post.excerpt || post.metaDescription || undefined,
    image: image || undefined,
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt,
    author: post.author || store.storeName,
    publisherName: store.storeName,
    keywords: post.tags.join(', '),
  });
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Blog', url: `${SITE}/blog` },
    { name: post.title, url: `${SITE}/blog/${post.slug}` },
  ]);

  // Theme Studio override: render the active theme's `layouts.blogPost` grid
  // when it exists, with the live post data, in the initial HTML.
  const layout = await getServerPageLayout('blogPost');
  if (layout) {
    return (
      <StaticLayoutRenderer
        layout={layout}
        data={{ post: { title: post.title, content: post.content || '' } }}
      />
    );
  }

  return (
    <article
      className="post-article"
      style={{ maxWidth: 'min(1180px, 100%)', margin: '0 auto', padding: '40px 20px 80px' }}
    >
      <style>{`
        /* Article + on-this-page rail.
           The layout stays a single centered reading column until the
           client-side TOC has found headings and adds .has-toc — so short
           posts and the first paint never show a hollow right rail, and
           every section keeps its own centered column. */
        .post-body h2, .post-body h3 { scroll-margin-top: 96px; }
        .toc-aside { display: none; }
        .post-article.has-toc .toc-aside { display: block; }
        @media (max-width: 1023.98px) {
          .post-article.has-toc .post-rail { display: flex; flex-direction: column; }
          .post-article.has-toc .post-body { order: 3; }
          .post-article.has-toc .toc-aside { order: 2; width: 100%; max-width: 760px; margin: 28px auto 0; }
        }
        @media (min-width: 1024px) {
          .post-article.has-toc {
            display: grid;
            grid-template-columns: minmax(0, 760px) minmax(0, 300px);
            column-gap: 48px;
            justify-content: center;
            align-items: start;
          }
          .post-article.has-toc .cover-band { grid-column: 1 / -1; }
          .post-article.has-toc .post-rail { display: contents; }
          /* The aside is explicitly pinned to the second column across the
             whole article, so every auto-placed sibling (header, body,
             share, subscribe, ...) fills the reading column in order. */
          .post-article.has-toc .toc-aside {
            grid-column: 2;
            grid-row: 1 / span 40;
            position: sticky;
            top: 96px;
            max-height: calc(100vh - 128px);
            overflow-y: auto;
            min-width: 0;
          }
        }
      `}</style>
      <script
        type="application/ld+json"
        data-testid="json-ld-post"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(asGraph([jsonLd, breadcrumb])) }}
      />

      <ReadingProgress />
      <PostViewCounter slug={post.slug} />

      <nav style={{ maxWidth: '760px', margin: '0 auto 24px', fontSize: '14px' }}>
        <Link
          href="/blog"
          style={{
            color: 'var(--accent, #3b82f6)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
          }}
        >
          <DirectionArrow kind="back" /> All posts
        </Link>
      </nav>

      {/* Cover band - full container width, like a magazine plate. */}
      {image && (
        <div
          className="cover-band"
          style={{
            width: '100%',
            aspectRatio: '21 / 9',
            overflow: 'hidden',
            borderRadius: 'calc(var(--radius, 12px) + 4px)',
            margin: '0 auto 32px',
            maxHeight: '520px',
          }}
        >
          {/* Article hero: eager (it is the LCP candidate on article
              pages), but decode async so it never blocks first paint. */}
          <img
            src={image}
            alt={post.title}
            loading="eager"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div className="post-rail">
      <header style={{ maxWidth: '760px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '14px',
          }}
        >
          {post.isFeatured && (
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '999px',
                backgroundColor: 'var(--brand, #111)',
                color: 'var(--brand-text, #fff)',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Featured
            </span>
          )}
          {post.tags.map((t) => (
            <Link
              key={t}
              href={`/blog?tag=${encodeURIComponent(t)}`}
              style={{
                fontSize: '12px',
                padding: '4px 12px',
                borderRadius: '999px',
                textDecoration: 'none',
                backgroundColor: 'var(--body-bg, #f3f4f6)',
                border: '1px solid var(--border, #e5e5e5)',
                color: 'var(--muted, #555)',
              }}
            >
              {t}
            </Link>
          ))}
        </div>

        <h1
          style={{
            fontSize: 'clamp(30px, 5vw, 44px)',
            fontWeight: 'var(--heading-weight, 800)' as any,
            letterSpacing: '-0.025em',
            lineHeight: 1.12,
            color: 'var(--body-text, #111)',
          }}
        >
          {post.title}
        </h1>

        {/* Meta bar: author avatar + name, date, reading time. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginTop: '20px',
            paddingBottom: '20px',
            borderBottom: '1px solid var(--border, #e5e5e5)',
            fontSize: '14px',
            color: 'var(--muted, #666)',
          }}
        >
          {post.author && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              <AuthorAvatar name={post.author} />
              <span style={{ color: 'var(--body-text, #111)', fontWeight: 600 }}>{post.author}</span>
            </span>
          )}
          <span aria-hidden="true" style={{ opacity: 0.4 }}>
            ·
          </span>
          <time dateTime={(post.publishedAt || post.createdAt).slice(0, 10)}>
            {formatPostDate(post.publishedAt || post.createdAt)}
          </time>
          <span aria-hidden="true" style={{ opacity: 0.4 }}>
            ·
          </span>
          <span>{post.readingMinutes} min read</span>
        </div>
      </header>

      {post.excerpt && (
        <p
          style={{
            maxWidth: '760px',
            margin: '24px auto 0',
            fontSize: '19px',
            lineHeight: 1.65,
            color: 'var(--muted, #555)',
            fontWeight: 500,
          }}
        >
          {post.excerpt}
        </p>
      )}

      <div
        className="post-body"
        style={{ maxWidth: '760px', margin: '28px auto 0', fontSize: '17px' }}
      >
        {/* Scoped article typography: the body HTML is admin-authored, so
            headings/lists/quotes/links/images get a consistent editorial
            rhythm here instead of raw browser defaults. */}
        <style>{`
          .post-body p { margin: 0 0 1.15em; line-height: 1.8; }
          .post-body h2 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.25; margin: 1.6em 0 0.6em; color: var(--body-text, #111); }
          .post-body h3 { font-size: 20px; font-weight: 700; line-height: 1.3; margin: 1.4em 0 0.5em; color: var(--body-text, #111); }
          .post-body h4 { font-size: 17px; font-weight: 700; margin: 1.3em 0 0.4em; color: var(--body-text, #111); }
          .post-body ul, .post-body ol { margin: 0 0 1.15em; padding-inline-start: 1.5em; line-height: 1.8; }
          .post-body li { margin-bottom: 0.35em; }
          .post-body a { color: var(--accent, #3b82f6); text-decoration: underline; text-underline-offset: 3px; }
          .post-body img { border-radius: var(--radius, 12px); margin: 1.2em auto; max-width: 100%; }
          .post-body blockquote { margin: 1.4em 0; padding: 14px 20px; border-inline-start: 4px solid var(--brand, #111); background: var(--body-bg, #f5f5f7); border-radius: 0 var(--radius, 10px) var(--radius, 10px) 0; color: var(--body-text, #222); font-style: italic; line-height: 1.7; }
          .post-body blockquote p { margin: 0; }
          .post-body :first-child { margin-top: 0; }
        `}</style>
        {post.blocks && post.blocks.length > 0 ? (
          // Block layout. The HTML block fields were sanitised server-side
          // ON WRITE (blog.routes.ts / contentBlocks.ts), never on read -
          // same contract as the legacy content column below.
          <PageBlocks blocks={post.blocks} />
        ) : (
          // Sanitised server-side ON WRITE (blog.routes.ts), never on read.
          <div dangerouslySetInnerHTML={{ __html: post.content || '' }} />
        )}
      </div>

      <aside className="toc-aside">
        <TableOfContents />
      </aside>
      </div>

      {/* End of article: share, author, subscribe, previous/next. */}
      <div style={{ maxWidth: '760px', margin: '52px auto 0' }}>
        <ShareButtons
          url={`${SITE}/blog/${post.slug}`}
          title={post.title}
          label="Share this post"
          center
        />
      </div>

      {/* End-of-article author card. Skipped when the author IS the store
          (the header byline already says it) so it never reads as a
          self-referential filler; when shown it adds the publication
          context the compact byline cannot carry. */}
      {post.author && post.author !== store.storeName && (
        <div
          style={{
            maxWidth: '760px',
            margin: '40px auto 0',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '16px 18px',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 'calc(var(--radius, 10px) + 2px)',
            backgroundColor: 'var(--card-bg, #fff)',
          }}
        >
          <AuthorAvatar name={post.author} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', color: 'var(--muted, #666)' }}>Written by</div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--body-text, #111)' }}>
              {post.author}
            </div>
            <div
              style={{
                fontSize: '12.5px',
                color: 'var(--muted, #666)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              A story from the {store.storeName} blog
            </div>
          </div>
        </div>
      )}

      <BlogSubscribe />

      {neighbors && (neighbors.newer || neighbors.older) && (
        <nav
          aria-label="Previous and next posts"
          style={{
            maxWidth: '760px',
            margin: '40px auto 0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          {neighbors.older ? (
            <PostNavCard label="Older post" post={neighbors.older} kind="back" />
          ) : null}
          {neighbors.newer ? (
            <PostNavCard label="Newer post" post={neighbors.newer} kind="forward" />
          ) : null}
        </nav>
      )}

      {post.related && post.related.length > 0 && (
        <section style={{ marginTop: '64px', paddingTop: '32px', borderTop: '1px solid var(--border, #e5e5e5)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 'var(--heading-weight, 800)' as any,
                letterSpacing: '-0.02em',
                margin: 0,
                color: 'var(--body-text, #111)',
              }}
            >
              Keep reading
            </h2>
            <Link
              href="/blog"
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--accent, #3b82f6)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              All posts <DirectionArrow kind="forward" />
            </Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '20px',
            }}
          >
            {post.related.map((r) => (
              <PostCard key={r.id} post={r} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

interface NavPost {
  title: string;
  slug: string;
}

/**
 * Date-sorted neighbours of `slug` in the public blog feed.
 *
 * The feed endpoint orders featured posts first, so row-index arithmetic
 * around the current post is wrong for pinned posts — re-sort the fetched
 * rows by (publishedAt ?? createdAt) and take the neighbours from there.
 * Two pages (up to 100 posts) are fetched; posts deeper in the archive
 * simply yield no navigation.
 */
async function getFeedNeighbors(
  slug: string,
  lang: string
): Promise<{ older: NavPost | null; newer: NavPost | null }> {
  const empty = { older: null, newer: null };
  const rows: BlogPost[] = [];
  try {
    for (let page = 1; page <= 2; page += 1) {
      const qs = new URLSearchParams({ page: String(page), limit: '50' });
      if (lang) qs.set('lang', lang);
      const res = await serverFetch(`/blog?${qs}`, { cache: 'no-store' });
      if (!res.ok) break;
      const body = await res.json().catch(() => null);
      const list: BlogPost[] = body?.data || [];
      rows.push(...list);
      if (list.length < 50) break; // no second page
    }
  } catch {
    return empty;
  }
  if (rows.length === 0) return empty;
  const stamp = (post: BlogPost) => new Date(post.publishedAt || post.createdAt).getTime();
  const sorted = [...rows].sort((a, b) => stamp(b) - stamp(a));
  const idx = sorted.findIndex((post) => post.slug === slug);
  if (idx < 0) return empty;
  const pick = (post: BlogPost | undefined): NavPost | null =>
    post ? { title: post.title, slug: post.slug } : null;
  return { older: pick(sorted[idx + 1]), newer: pick(sorted[idx - 1]) };
}

/** One half of the previous/next navigation card row. */
function PostNavCard({
  label,
  post,
  kind,
}: {
  label: string;
  post: NavPost;
  kind: 'back' | 'forward';
}) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '16px 18px',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 'calc(var(--radius, 10px) + 2px)',
        backgroundColor: 'var(--card-bg, #fff)',
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11.5px',
          fontWeight: 800,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--muted, #6b7280)',
        }}
      >
        {kind === 'back' ? <DirectionArrow kind="back" /> : null}
        {label}
        {kind === 'forward' ? <DirectionArrow kind="forward" /> : null}
      </span>
      <span
        style={{
          fontSize: '16px',
          fontWeight: 700,
          lineHeight: 1.45,
          color: 'var(--body-text, #111)',
        }}
      >
        {post.title}
      </span>
    </Link>
  );
}

/** Deterministic author avatar: initials on a coloured disc, derived from
 *  the name so the same author always gets the same colour. Mirrors the
 *  deterministic-tile approach PostCard uses for missing cover images. */
function AuthorAvatar({ name }: { name: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
  return (
    <span
      aria-hidden="true"
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `hsl(${h}, 55%, 88%)`,
        color: `hsl(${h}, 45%, 30%)`,
        fontSize: '13px',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
