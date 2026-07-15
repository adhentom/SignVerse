import { useEffect, useMemo, useRef } from 'react';

function segmentCaption(caption: string, count: number): string[] {
  if (!caption.trim() || count === 0) return [];
  const words = caption.trim().split(/\s+/u);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.min(words.length - 1, Math.floor((index * words.length) / count));
    const end = Math.floor(((index + 1) * words.length) / count);
    return words.slice(start, Math.max(start + 1, end)).join(' ');
  });
}

export function MalayalamCaptionTrack({
  caption,
  currentIndex,
  signCount,
}: {
  caption: string;
  currentIndex: number;
  signCount: number;
}) {
  const current = useRef<HTMLElement>(null);
  const segments = useMemo(() => segmentCaption(caption, signCount), [caption, signCount]);

  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <section aria-label="Synchronized Malayalam captions" className="sv-playback-captions" lang="ml">
      <span>Malayalam captions</span>
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
        )) : <p>മലയാള പരിഭാഷ ലഭ്യമല്ല.</p>}
      </div>
    </section>
  );
}
