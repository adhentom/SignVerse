import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackController } from '../../playback/usePlaybackController';

const sequence = {
  items: [
    { token_id: 'one', asset_id: 'asset-one', duration: 1, confidence: 1 },
    { token_id: 'two', asset_id: 'asset-two', duration: 1, confidence: 1 },
  ],
  unsupported_tokens: [],
};

function Harness() {
  const playback = usePlaybackController(sequence);
  return (
    <div>
      <output>{playback.snapshot.state}:{playback.scheduled?.item.token_id}:{playback.snapshot.elapsed.toFixed(1)}</output>
      <button onClick={playback.play}>Play</button>
      <button onClick={playback.pause}>Pause</button>
      <button onClick={playback.next}>Next</button>
      <button onClick={() => playback.seek(0.5)}>Seek</button>
    </div>
  );
}

function QueueHarness({ items }: { items: typeof sequence.items }) {
  const playback = usePlaybackController({ items, unsupported_tokens: [] });
  return <><output>{playback.snapshot.state}:{playback.scheduled?.item.token_id}</output><button onClick={playback.play}>Queue play</button></>;
}

describe('playback controller', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  it('plays, pauses, seeks, and moves through the schedule', () => {
    const button = (label: string) => [...container.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === label) as HTMLButtonElement;

    act(() => button('Play').click());
    act(() => vi.advanceTimersByTime(1_100));
    expect(container.textContent).toContain('Playing:two:1.1');

    act(() => button('Pause').click());
    act(() => vi.advanceTimersByTime(500));
    expect(container.textContent).toContain('Paused:two:1.1');

    act(() => button('Seek').click());
    expect(container.textContent).toContain('Paused:one:0.5');

    act(() => button('Next').click());
    expect(container.textContent).toContain('Paused:two:1.0');
  });

  it('continues when streaming appends a playback item', () => {
    const first = sequence.items.slice(0, 1);
    act(() => root.render(<QueueHarness items={first} />));
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    act(() => vi.advanceTimersByTime(1_100));
    expect(container.textContent).toContain('Finished:one');

    act(() => root.render(<QueueHarness items={sequence.items} />));
    expect(container.textContent).toContain('Playing:two');
  });
});
