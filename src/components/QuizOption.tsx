import { clsx } from "clsx";

interface QuizOptionProps {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}

export function QuizOption({
  label,
  description,
  selected,
  onSelect,
}: QuizOptionProps) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={clsx(
        "w-full text-left rounded-[var(--radius-lg)] p-[var(--space-4)]",
        "flex items-center gap-[var(--space-3)]",
        "transition-all duration-100 ease-out",
        "min-h-[44px]",
        selected
          ? "border-[1.5px] border-[var(--text-primary)] bg-[var(--surface)]"
          : "border-[1.5px] border-[var(--border)] bg-[var(--surface)]",
        !selected && "hover:border-[var(--text-primary)]"
      )}
    >
      {/* Radio dot */}
      <span
        className={clsx(
          "shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center",
          "border-[1.5px] transition-colors duration-100",
          selected ? "border-[var(--text-primary)]" : "border-[var(--border)]"
        )}
        aria-hidden="true"
      >
        {selected && (
          <span className="w-[8px] h-[8px] rounded-full bg-[var(--text-primary)]" />
        )}
      </span>

      <div className="flex-1 min-w-0">
        <span className="text-body text-[var(--text-primary)] font-[500]">
          {label}
        </span>
        {description && (
          <p className="text-small text-[var(--text-secondary)] mt-[2px]">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}
