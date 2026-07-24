import { useEffect, useMemo, useRef } from 'react';

export function segmentCaption(caption: string, count: number): string[] {
  if (!caption.trim() || count === 0) return [];
  const words = caption.trim().split(/\s+/u);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.min(words.length - 1, Math.floor((index * words.length) / count));
    const end = Math.floor(((index + 1) * words.length) / count);
    return words.slice(start, Math.max(start + 1, end)).join(' ');
  });
}

export function FloatingCaption({
  caption,
  currentIndex,
  emptyMessage,
  signCount,
}: {
  caption: string;
  currentIndex: number;
  emptyMessage: string;
  signCount: number;
}) {
  const segments = useMemo(() => segmentCaption(caption, signCount), [caption, signCount]);
  const synchronized = (segments[currentIndex] ?? caption.trim()) || emptyMessage;

  return (
    <div aria-live="polite" className="sv-floating-caption" lang="en">
      <span>Live caption</span>
      <p>{synchronized}</p>
    </div>
  );
}

export function EnglishCaptionTrack({
  caption,
  currentIndex,
  emptyMessage = 'English source text is unavailable.',
  signCount,
}: {
  caption: string;
  currentIndex: number;
  emptyMessage?: string;
  signCount: number;
}) {
  const current = useRef<HTMLElement>(null);
  const segments = useMemo(() => segmentCaption(caption, signCount), [caption, signCount]);

  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <section aria-label="Synchronized English source captions" className="sv-playback-captions" lang="en">
      <span>English source</span>
      <div aria-live="polite" tabIndex={0}>
        {segments.length > 0 ? segments.map((segment, index) => (
          <mark
            aria-current={index === currentIndex ? 'true' : undefined}
            className={index === currentIndex ? 'sv-caption--current' : ''}
            key={`${segment}-${index}`}
            ref={index === currentIndex ? current : undefined}
          >
            {segment}
          </mark>
        )) : <p>{emptyMessage}</p>}
      </div>
    </section>
  );
}
