import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_KEY = 'signverse.interpreterGeometry';
const DEFAULT_GEOMETRY = { x: 24, y: 80, width: 260, height: 360 };

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

function validGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Geometry>;
  return ['x', 'y', 'width', 'height'].every((key) => {
    const number = candidate[key as keyof Geometry];
    return typeof number === 'number' && Number.isFinite(number);
  });
}

function clampGeometry(geometry: Geometry): Geometry {
  const width = Math.min(Math.max(geometry.width, 210), Math.min(520, window.innerWidth * 0.9));
  const height = Math.min(Math.max(geometry.height, 260), window.innerHeight * 0.8);
  return {
    width,
    height,
    x: Math.min(Math.max(geometry.x, 0), Math.max(0, window.innerWidth - width)),
    y: Math.min(Math.max(geometry.y, 0), Math.max(0, window.innerHeight - height)),
  };
}

function persist(geometry: Geometry): void {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    void chrome.storage.local.set({ [STORAGE_KEY]: geometry }).catch(() => undefined);
  }
}

export function useInterpreterGeometry() {
  const stageRef = useRef<HTMLDivElement>(null);
  const cleanupDrag = useRef<() => void>(() => undefined);
  const [geometry, setGeometry] = useState(DEFAULT_GEOMETRY);

  useEffect(() => {
    let active = true;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.get(STORAGE_KEY)
        .then((stored) => {
          if (active && validGeometry(stored[STORAGE_KEY])) {
            setGeometry(clampGeometry(stored[STORAGE_KEY]));
          }
        })
        .catch(() => undefined);
    }
    const resize = () => setGeometry((current) => clampGeometry(current));
    window.addEventListener('resize', resize);
    return () => {
      active = false;
      cleanupDrag.current();
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !stageRef.current) return;
    let timer = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setGeometry((current) => {
          const next = clampGeometry({
            ...current,
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
          persist(next);
          return next;
        });
      }, 120);
    });
    observer.observe(stageRef.current);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    cleanupDrag.current();
    const origin = { pointerX: event.clientX, pointerY: event.clientY, ...geometry };
    const move = (next: PointerEvent) => setGeometry((current) => clampGeometry({
      ...current,
      x: origin.x + next.clientX - origin.pointerX,
      y: origin.y + next.clientY - origin.pointerY,
    }));
    const removeListeners = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      cleanupDrag.current = () => undefined;
    };
    const stop = () => {
      removeListeners();
      setGeometry((current) => {
        persist(current);
        return current;
      });
    };
    cleanupDrag.current = removeListeners;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function moveWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const direction = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    setGeometry((current) => {
      const next = clampGeometry({
        ...current,
        x: current.x + direction[0],
        y: current.y + direction[1],
      });
      persist(next);
      return next;
    });
  }

  return { geometry, moveWithKeyboard, stageRef, startDrag };
}
