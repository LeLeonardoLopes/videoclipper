interface ProgressBarProps {
  percentage: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const barSizes = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const barColors = {
  primary: 'bg-primary-600',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

export function ProgressBar({
  percentage,
  label,
  showPercentage = true,
  size = 'md',
  color = 'primary',
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
          {showPercentage && <span className="text-sm font-medium text-gray-500">{Math.round(clamped)}%</span>}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${barSizes[size]}`}>
        <div
          className={`${barColors[color]} ${barSizes[size]} rounded-full transition-all duration-1000 ease-in-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
