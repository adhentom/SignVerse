import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface Point {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  origin: Point;
  start: Point;
}

const EDGE_GAP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function useDraggable() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const constrainPosition = useCallback((next: Point): Point => {
    const bounds = widgetRef.current?.getBoundingClientRect();
    const width = bounds?.width ?? 64;
    const height = bounds?.height ?? 64;

    return {
      x: clamp(next.x, EDGE_GAP, window.innerWidth - width - EDGE_GAP),
      y: clamp(next.y, EDGE_GAP, window.innerHeight - height - EDGE_GAP),
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => (current ? constrainPosition(current) : current));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [constrainPosition]);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return;
    }

    const bounds = widgetRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: bounds.left, y: bounds.top },
      start: { x: event.clientX, y: event.clientY },
    };
    setPosition({ x: bounds.left, y: bounds.top });
    setIsDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setPosition(
      constrainPosition({
        x: drag.origin.x + event.clientX - drag.start.x,
        y: drag.origin.y + event.clientY - drag.start.y,
      }),
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);
  }

  return {
    widgetRef,
    position,
    isDragging,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
