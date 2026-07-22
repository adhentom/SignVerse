import type { ModePlaceholder } from '../types';
import { ModeIcon } from './ModeIcon';

interface ModeCardProps {
  isActive: boolean;
  mode: ModePlaceholder;
}

export function ModeCard({ isActive, mode }: ModeCardProps) {
  return (
    <div
      aria-label={`${mode.label}, ${isActive ? 'detected platform' : 'placeholder'}`}
      className={`sv-mode-card ${isActive ? 'sv-mode-card--active' : ''}`}
    >
      <span className="sv-mode-icon">
        <ModeIcon icon={mode.icon} />
      </span>
      <span className="sv-mode-copy">
        <span className="sv-mode-label">{mode.label}</span>
        <span className="sv-mode-description">{mode.description}</span>
      </span>
      <span className="sv-mode-badge">{isActive ? 'Active' : 'Soon'}</span>
    </div>
  );
}
