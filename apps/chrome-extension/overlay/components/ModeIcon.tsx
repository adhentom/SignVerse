import type { ModePlaceholder } from '../types';

interface ModeIconProps {
  icon: ModePlaceholder['icon'];
}

export function ModeIcon({ icon }: ModeIconProps) {
  if (icon === 'youtube') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <rect height="13" rx="4" stroke="currentColor" strokeWidth="1.7" width="19" x="2.5" y="5.5" />
        <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
      </svg>
    );
  }

  if (icon === 'meet') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <rect height="13" rx="3" stroke="currentColor" strokeWidth="1.7" width="13" x="3" y="5.5" />
        <path d="m16 10 4-2v8l-4-2v-4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.4 8.8 12S9.9 5.8 12 3.5Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
