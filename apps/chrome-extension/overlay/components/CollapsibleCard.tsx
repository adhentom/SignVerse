import { useId, useState, type ReactNode } from 'react';
import { UIIcon } from './UIIcon';

interface CollapsibleCardProps {
  badge?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  icon: Parameters<typeof UIIcon>[0]['name'];
  title: string;
}

export function CollapsibleCard({
  badge,
  children,
  defaultExpanded = false,
  icon,
  title,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <section className={`sv-card ${expanded ? 'sv-card--expanded' : ''}`}>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className="sv-card-trigger"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="sv-card-icon"><UIIcon name={icon} /></span>
        <span className="sv-card-title">{title}</span>
        {badge && <span className="sv-card-badge">{badge}</span>}
        <span className="sv-card-chevron"><UIIcon name="chevron" /></span>
      </button>
      <div className="sv-card-content" hidden={!expanded} id={contentId}>
        {children}
      </div>
    </section>
  );
}
