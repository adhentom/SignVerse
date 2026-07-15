import type { ModePlaceholder } from '../types';
import { ModeIcon } from './ModeIcon';

interface ModeCardProps {
  mode: ModePlaceholder;
}

export function ModeCard({ mode }: ModeCardProps) {
  return (
    <div aria-label={`${mode.label}, placeholder`} className="sv-mode-card">
      <span className="sv-mode-icon">
        <ModeIcon icon={mode.icon} />
      </span>
      <span className="sv-mode-copy">
        <span className="sv-mode-label">{mode.label}</span>
        <span className="sv-mode-description">{mode.description}</span>
      </span>
      <span className="sv-mode-badge">Soon</span>
    </div>
  );
}
