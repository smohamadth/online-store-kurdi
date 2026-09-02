// Video embed — a rich prebuilt home block (type "video").
//
// Accepts a YouTube, Vimeo or direct .mp4/.webm URL and renders a
// responsive embed with optional autoplay/mute/loop. Only the two major
// providers and direct video files are allowed as iframe sources — an
// unknown link renders nothing (never a raw third-party iframe).

'use client';

import { SectionHeading } from '@/components/HomeSections';

interface Props {
  title?: string | null;
  subtitle?: string | null;
  url?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Wrapper aspect ratio. */
  aspect?: '16:9' | '4:3' | '1:1' | '21:9';
  poster?: string;
}

const ASPECT: Record<NonNullable<Props['aspect']>, string> = {
  '16:9': '16 / 9',
  '4:3': '4 / 3',
  '1:1': '1 / 1',
  '21:9': '21 / 9',
};

const YT_RE =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;
const DIRECT_RE = /\.(mp4|webm|ogg|ogv)(\?.*)?$/i;

function parse(url: string): { kind: 'youtube' | 'vimeo' | 'file'; src?: string } | null {
  const yt = url.match(YT_RE);
  if (yt) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = url.match(VIMEO_RE);
  if (vimeo) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  // Accept already-canonical embed URLs of the two providers.
  if (/^https:\/\/(www\.)?youtube-nocookie\.com\/embed\//.test(url)) return { kind: 'youtube', src: url };
  if (/^https:\/\/player\.vimeo\.com\/video\//.test(url)) return { kind: 'vimeo', src: url };
  if (DIRECT_RE.test(url)) return { kind: 'file', src: url };
  return null;
}

export default function VideoSection({
  title,
  subtitle,
  url,
  autoplay = false,
  muted = false,
  loop = false,
  aspect = '16:9',
  poster,
}: Props) {
  if (!url) return null;
  const parsed = parse(url);
  if (!parsed) return null;

  const query: string[] = [];
  if (autoplay) {
    query.push('autoplay=1');
    query.push('muted=1'); // browsers block unmuted autoplay
  }
  if (muted && !autoplay) query.push('muted=1');
  if (loop) query.push('loop=1');
  const embedSrc =
    parsed.kind === 'file'
      ? parsed.src
      : `${parsed.src}${query.length ? `?${query.join('&')}` : ''}`;
  const mute = autoplay || muted;

  return (
    <section
      data-section="video"
      style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '64px 20px' }}
    >
      <SectionHeading title={title} subtitle={subtitle} center />
      <div
        style={{
          margin: title || subtitle ? '36px auto 0' : '0 auto',
          maxWidth: '920px',
        }}
      >
        <div
          style={{
            position: 'relative',
            aspectRatio: ASPECT[aspect] ?? ASPECT['16:9'],
            borderRadius: 'calc(var(--radius, 8px) + 4px)',
            overflow: 'hidden',
            backgroundColor: 'var(--surface-2, #111)',
            boxShadow: 'var(--shadow, none)',
          }}
        >
          {parsed.kind === 'file' ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={embedSrc}
              poster={poster || undefined}
              controls={!autoplay}
              autoPlay={autoplay}
              muted={mute}
              loop={loop}
              playsInline
              preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <iframe
              src={embedSrc}
              title={title || 'Embedded video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          )}
        </div>
        {parsed.kind === 'file' && poster && (
          <p style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '8px' }}>
            This video plays in your browser — it does not stream from a third-party player.
          </p>
        )}
      </div>
    </section>
  );
}
