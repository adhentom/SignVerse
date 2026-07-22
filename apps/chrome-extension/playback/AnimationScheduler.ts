import type { PlaybackSequence } from '../shared/interpretation';
import type { ScheduledSign } from './types';

export class AnimationScheduler {
  private readonly starts: number[];
  readonly totalDuration: number;

  constructor(private readonly sequence: PlaybackSequence) {
    let elapsed = 0;
    this.starts = sequence.items.map((item) => {
      const start = elapsed;
      elapsed += item.duration;
      return start;
    });
    this.totalDuration = elapsed;
  }

  locate(elapsed: number): ScheduledSign | undefined {
    if (this.sequence.items.length === 0) return undefined;
    const clamped = Math.min(Math.max(0, elapsed), this.totalDuration);
    let index = this.sequence.items.findIndex(
      (item, candidate) => clamped < this.starts[candidate] + item.duration,
    );
    if (index < 0) index = this.sequence.items.length - 1;
    const item = this.sequence.items[index];
    const localElapsed = Math.min(item.duration, Math.max(0, clamped - this.starts[index]));
    return {
      item,
      index,
      start: this.starts[index],
      end: this.starts[index] + item.duration,
      localElapsed,
      localProgress: item.duration > 0 ? localElapsed / item.duration : 0,
    };
  }

  startOf(index: number): number {
    return this.starts[Math.min(Math.max(index, 0), this.starts.length - 1)] ?? 0;
  }
}
