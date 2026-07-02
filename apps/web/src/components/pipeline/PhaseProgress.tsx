import { ProgressBar } from '../ui/ProgressBar';

interface PhaseProgressProps {
  percentage: number;
  overallPercentage: number;
  message: string;
}

export function PhaseProgress({ percentage, overallPercentage, message }: PhaseProgressProps) {
  return (
    <div className="space-y-6">
      <div>
        <ProgressBar percentage={overallPercentage} label="Progresso geral" size="lg" />
      </div>
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
          <p className="text-sm font-medium text-gray-700">{message}</p>
        </div>
        <ProgressBar percentage={percentage} showPercentage size="sm" color="primary" />
      </div>
    </div>
  );
}
