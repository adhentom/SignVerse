import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_KEY = 'signverse.interpreterGeometry';
const DEFAULT_GEOMETRY = { x: 24, y: 80, width: 360, height: 580 };

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function readBorderBox(target: Element): Pick<Geometry, 'width' | 'height'> {
  const { width, height } = target.getBoundingClientRect();
  return { width, height };
}

function validGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Geometry>;
  return ['x', 'y', 'width', 'height'].every((key) => {
    const number = candidate[key as keyof Geometry];
    return typeof number === 'number' && Number.isFinite(number);
  });
}

function clampPosition(geometry: Geometry): Geometry {
  return {
    ...geometry,
    x: Math.min(Math.max(geometry.x, 0), Math.max(0, window.innerWidth - geometry.width)),
    y: Math.min(Math.max(geometry.y, 0), Math.max(0, window.innerHeight - geometry.height)),
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
            setGeometry(clampPosition(stored[STORAGE_KEY]));
          }
        })
        .catch(() => undefined);
    }
    const resize = () => setGeometry((current) => clampPosition(current));
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
        const bounds = readBorderBox(entry.target);
        setGeometry((current) => {
          const next = clampPosition({
            ...current,
            // Native CSS resize changes the border box. Persisting contentRect
            // and reapplying it as border-box dimensions caused progressive shrink.
            width: bounds.width,
            height: bounds.height,
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
    const move = (next: PointerEvent) => setGeometry((current) => clampPosition({
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
        const right = window.innerWidth - current.width;
        const next = {
          ...current,
          x: current.x < 32 ? 0 : right - current.x < 32 ? right : current.x,
        };
        persist(next);
        return next;
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
      const next = clampPosition({
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
