interface ProgressBarProps {
  value: number; // 0–100
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
      className="w-full h-[4px] rounded-[var(--radius-full)] bg-[var(--border)] overflow-hidden"
    >
      <div
        className="h-full rounded-[var(--radius-full)] bg-[var(--text-primary)] transition-all duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
