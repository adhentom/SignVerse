type IconName =
  | 'accessibility'
  | 'alert'
  | 'book'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'code'
  | 'copy'
  | 'globe'
  | 'key'
  | 'list'
  | 'minimize'
  | 'next'
  | 'pause'
  | 'play'
  | 'refresh'
  | 'sparkles'
  | 'status'
  | 'translate';

export function UIIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    accessibility: <><circle cx="12" cy="4.5" r="2" /><path d="M5 8.5c4.5 1.6 9.5 1.6 14 0M12 7v13M8.5 20l3.5-6 3.5 6" /></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17.3v.2" /></>,
    book: <><path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a3 3 0 0 0-3-3H4V4.5ZM20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a3 3 0 0 1 3-3h5V4.5Z" /></>,
    check: <path d="m5 12.5 4 4L19 7.5" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" /></>,
    key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M17 12v3M20 12v2" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
    minimize: <path d="M6 12h12" />,
    next: <><path d="m6 5 9 7-9 7V5Z" /><path d="M18 5v14" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m7 4 12 8-12 8V4Z" />,
    refresh: <><path d="M19 7V3l-2 2a8 8 0 1 0 2.4 8" /><path d="M19 3h-4" /></>,
    sparkles: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /></>,
    status: <><path d="M4 12a8 8 0 1 1 2.3 5.7" /><path d="M4 17v-5h5" /></>,
    translate: <><path d="M4 5h9M8.5 3v2M6 5c.5 3.5 2.5 6 6 8M11 5c-.5 3.5-2.5 6-6 8" /><path d="m14 20 3.5-9 3.5 9M15.3 17h4.4" /></>,
  };

  return (
    <svg aria-hidden="true" className="sv-ui-icon" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {paths[name]}
      </g>
    </svg>
  );
}
