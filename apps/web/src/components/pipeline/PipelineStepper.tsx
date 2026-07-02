import { PipelinePhase } from '@/types';

interface PipelineStepperProps {
  currentPhase: string | null;
  completedPhases?: string[];
}

const steps = [
  { phase: PipelinePhase.INGESTION, label: 'Download', icon: '1' },
  { phase: PipelinePhase.TRANSCRIPTION, label: 'Transcrição', icon: '2' },
  { phase: PipelinePhase.VIRALITY_ANALYSIS, label: 'Análise', icon: '3' },
  { phase: PipelinePhase.EDITING_EXPORT, label: 'Edição', icon: '4' },
];

export function PipelineStepper({ currentPhase, completedPhases = [] }: PipelineStepperProps) {
  const currentIndex = steps.findIndex((s) => s.phase === currentPhase);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = completedPhases.includes(step.phase) || index < currentIndex;
          const isCurrent = step.phase === currentPhase;

          return (
            <div key={step.phase} className="flex-1 flex flex-col items-center relative">
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={`absolute top-5 -left-1/2 w-full h-0.5 ${
                    isCompleted ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Step circle */}
              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isCompleted
                    ? 'bg-primary-600 text-white'
                    : isCurrent
                      ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-600'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  step.icon
                )}
              </div>

              {/* Label */}
              <span
                className={`mt-2 text-xs font-medium ${
                  isCurrent ? 'text-primary-700' : isCompleted ? 'text-primary-600' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
