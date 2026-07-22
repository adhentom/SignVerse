interface SignVerseMarkProps {
  compact?: boolean;
}

export function SignVerseMark({ compact = false }: SignVerseMarkProps) {
  return (
    <span aria-hidden="true" className={compact ? 'sv-mark sv-mark--compact' : 'sv-mark'}>
      <svg fill="none" viewBox="0 0 32 32">
        <path
          d="M9.2 8.7c1.7-3.1 4.8-4.9 8.2-4.6 3.3.3 6.2 2.6 7.3 5.8l-4.4 1.5a4.3 4.3 0 0 0-3.4-2.7 4.2 4.2 0 0 0-4.1 2.2l-3.6-2.2Z"
          fill="currentColor"
        />
        <path
          d="M22.8 23.3c-1.7 3.1-4.8 4.9-8.2 4.6a8.6 8.6 0 0 1-7.3-5.8l4.4-1.5a4.3 4.3 0 0 0 3.4 2.7 4.2 4.2 0 0 0 4.1-2.2l3.6 2.2Z"
          fill="currentColor"
        />
        <path d="m11.8 12.1 9.1 7.8M20.3 11.6l-8.6 8.8" stroke="currentColor" strokeLinecap="round" strokeWidth="3.2" />
      </svg>
    </span>
  );
}
