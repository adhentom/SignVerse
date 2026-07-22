import { useEffect, useState } from 'react';
import type { InterpretationState } from '../../shared/interpretation';
import { UIIcon } from './UIIcon';

const STAGES = [
  'Reading Content',
  'Understanding Context',
  'Generating ISL Gloss',
  'Preparing Playback',
  'Ready',
] as const;

function getTargetStage(state: InterpretationState, loadingStage: number): number {
  if (state.status === 'ready') return STAGES.length - 1;
  if (state.status === 'loading') return loadingStage;
  return 0;
}

export function PipelineProgress({ state }: { state: InterpretationState }) {
  const [loadingStage, setLoadingStage] = useState(0);

  useEffect(() => {
    if (state.status !== 'loading') {
      setLoadingStage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStage((stage) => Math.min(stage + 1, STAGES.length - 2));
    }, 650);
    return () => window.clearInterval(timer);
  }, [state.status]);

  const activeStage = getTargetStage(state, loadingStage);
  const progress = state.status === 'idle' || state.status === 'error'
    ? 0
    : ((activeStage + 1) / STAGES.length) * 100;

  return (
    <section aria-label="Interpretation pipeline" className="sv-pipeline">
      <div className="sv-pipeline-heading">
        <div>
          <span className="sv-overline">AI pipeline</span>
          <strong>{state.status === 'ready' ? 'Interpretation ready' : STAGES[activeStage]}</strong>
        </div>
        <span aria-label={`${Math.round(progress)} percent complete`} className="sv-pipeline-percent">
          {Math.round(progress)}%
        </span>
      </div>
      <div aria-hidden="true" className="sv-pipeline-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol className="sv-pipeline-stages">
        {STAGES.map((stage, index) => {
          const complete = state.status === 'ready' || index < activeStage;
          const active = (state.status === 'loading' || state.status === 'ready') && index === activeStage;
          return (
            <li
              aria-current={active ? 'step' : undefined}
              className={`${complete ? 'sv-pipeline-stage--complete' : ''} ${active ? 'sv-pipeline-stage--active' : ''}`}
              key={stage}
            >
              <span className="sv-pipeline-dot">
                {complete ? <UIIcon name="check" /> : <span />}
              </span>
              <span>{stage}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
