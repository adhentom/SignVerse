import { vi } from 'vitest';

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: {
    loadAnimation: () => ({
      addEventListener: (event: string, callback: () => void) => {
        if (event === 'DOMLoaded') queueMicrotask(callback);
      },
      destroy: vi.fn(),
      goToAndStop: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      removeEventListener: vi.fn(),
      setSpeed: vi.fn(),
      totalFrames: 60,
    }),
  },
}));
