import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignPlaybackPanel } from '../../overlay/components/SignPlaybackPanel';
import type { InterpretationState } from '../../shared/interpretation';
import type { MediaClockSample } from '../../synchronization/SynchronizationTimeline';

function interpretation(): InterpretationState {
  return {
    status: 'ready',
    response: {
      summary: '',
      malayalam_translation: '',
      key_points: [],
      keywords: [],
      glossary: [],
      isl_gloss: ['ONE', 'TWO'],
      confidence: 0.9,
      playback: {
        items: [
          {
            token_id: 'ONE',
            asset_id: 'one',
            duration: 1,
            confidence: 0.9,
            synchronization: {
              caption_start_ms: 10_000,
              caption_end_ms: 11_000,
              cue_id: 'caption-1',
              request_sequence: 1,
              source_text: 'First caption',
            },
          },
          {
            token_id: 'TWO',
            asset_id: 'two',
            duration: 1,
            confidence: 0.9,
            synchronization: {
              caption_start_ms: 11_000,
              caption_end_ms: 12_000,
              cue_id: 'caption-2',
              request_sequence: 2,
              source_text: 'Second caption',
            },
          },
        ],
        unsupported_tokens: [],
      },
    },
  };
}

function mediaClock(
  positionMs: number,
  state: MediaClockSample['state'] = 'playing',
  rate = 1,
): MediaClockSample {
  return { positionMs, rate, sourceId: 'video', state };
}

describe('caption and avatar synchronization integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(clock: MediaClockSample) {
    await act(async () => {
      root.render(
        <SignPlaybackPanel
          debugEnabled
          mediaClock={clock}
          sourceText="Newest packet should not replace the scheduled caption"
          state={interpretation()}
        />,
      );
      await vi.advanceTimersByTimeAsync(60);
    });
  }

  it('uses one timestamp clock for the active caption, sign, and diagnostics', async () => {
    await render(mediaClock(11_500, 'playing', 1.75));

    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('TWO');
    expect(container.querySelector('[aria-current="true"]')?.textContent).toBe('Second caption');
    expect(container.querySelector('[aria-label="Synchronization timing diagnostics"]')?.textContent)
      .toContain('11500 ms');
    const speed = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Playback speed follows source video"]',
    );
    expect(speed?.value).toBe('1.75');
    expect(speed?.disabled).toBe(true);

    await render(mediaClock(10_200, 'seeking'));
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('ONE');
    expect(container.querySelector('[aria-current="true"]')?.textContent).toBe('First caption');
    expect(container.querySelector('[aria-label="Synchronization timing diagnostics"]')?.textContent)
      .toContain('seeking');
  });

  it('holds the synchronized sign when media playback pauses', async () => {
    await render(mediaClock(10_600, 'paused'));
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('ONE');
    expect(container.querySelector('button[aria-label="Resume sign sequence"]')).not.toBeNull();
  });

  it('pauses for advertisements and resumes automatically afterward', async () => {
    await render(mediaClock(10_600));
    expect(container.querySelector('button[aria-label="Pause sign sequence"]')).not.toBeNull();

    await render(mediaClock(10_600, 'advertisement'));
    expect(container.querySelector('button[aria-label="Resume sign sequence"]')).not.toBeNull();

    await render(mediaClock(10_700, 'playing'));
    expect(container.querySelector('button[aria-label="Pause sign sequence"]')).not.toBeNull();
  });
});
