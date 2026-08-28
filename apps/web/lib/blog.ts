/**
 * Shared blog types.
 *
 * Kept out of lib/http.ts so SERVER components can import them: that module is
 * `'use client'`, and importing a value from it into a server component yields
 * a client-reference Symbol rather than the value.
 */

import type { PageBlock } from './pageBlocks';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content?: string;
  /** Layout blocks, or null/absent for posts saved before blocks existed.
   *  When present the storefront renders these instead of `content`. */
  blocks?: PageBlock[] | null;
  excerpt: string | null;
  coverImage: string | null;
  author: string | null;
  tags: string[];
  status: 'draft' | 'published';
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  viewCount: number;
  readingMinutes: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  related?: BlogPost[];
}

export interface BlogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Human date, stable between server and client to avoid hydration mismatch. */
export function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
