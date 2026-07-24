import { useEffect, useMemo, useRef } from 'react';
import { buildCaptionTimeline } from '../../captions/CaptionTimeline';

export function segmentCaption(caption: string, count: number): string[] {
  return buildCaptionTimeline(caption, Array.from({ length: count }, () => 1))
    .map((segment) => segment.text);
}

export function FloatingCaption({
  caption,
  currentIndex,
  emptyMessage,
  signDurations,
}: {
  caption: string;
  currentIndex: number;
  emptyMessage: string;
  signDurations: readonly number[];
}) {
  const durationKey = signDurations.join('|');
  const timeline = useMemo(
    () => buildCaptionTimeline(caption, signDurations),
    [caption, durationKey],
  );
  const synchronized = (timeline[currentIndex]?.text ?? caption.trim()) || emptyMessage;

  return (
    <div aria-atomic="true" aria-live="polite" className="sv-floating-caption" lang="en">
      <span>Live caption</span>
      <p key={`${currentIndex}:${synchronized}`}>{synchronized}</p>
    </div>
  );
}

export function EnglishCaptionTrack({
  caption,
  currentIndex,
  emptyMessage = 'English source text is unavailable.',
  signDurations,
}: {
  caption: string;
  currentIndex: number;
  emptyMessage?: string;
  signDurations: readonly number[];
}) {
  const current = useRef<HTMLElement>(null);
  const durationKey = signDurations.join('|');
  const timeline = useMemo(
    () => buildCaptionTimeline(caption, signDurations),
    [caption, durationKey],
  );

  useEffect(() => {
    const reducedMotion = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    current.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [currentIndex]);

  return (
    <section aria-label="Synchronized English source captions" className="sv-playback-captions" lang="en">
      <span>English source</span>
      <div aria-live="polite" tabIndex={0}>
        {timeline.length > 0 ? timeline.map((segment) => (
          <mark
            aria-current={segment.index === currentIndex ? 'true' : undefined}
            className={segment.index === currentIndex ? 'sv-caption--current' : ''}
            data-end={segment.endSeconds}
            data-start={segment.startSeconds}
            key={`${segment.startSeconds}:${segment.text}`}
            ref={segment.index === currentIndex ? current : undefined}
          >
            {segment.text}
          </mark>
        )) : <p>{emptyMessage}</p>}
      </div>
    </section>
  );
}
