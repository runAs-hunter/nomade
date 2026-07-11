import { clsx } from "clsx";

interface CountryCardProps {
  emoji: string;
  country: string;
  visaName: string;
  duration: string;
  minIncome: number;
  featured?: boolean;
  comingSoon?: boolean;
  onClick?: () => void;
}

export function CountryCard({
  emoji,
  country,
  visaName,
  duration,
  minIncome,
  featured = false,
  comingSoon = false,
  onClick,
}: CountryCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      aria-label={`${country} — ${visaName}${comingSoon ? " (coming soon)" : ""}`}
      className={clsx(
        "w-full text-left rounded-[var(--radius-xl)] bg-[var(--surface)] p-[var(--space-4)]",
        "transition-all duration-150",
        // border
        featured
          ? "border-[1.5px] border-[var(--text-primary)]"
          : "border border-[var(--border)]",
        // coming soon
        comingSoon
          ? "opacity-40 cursor-not-allowed"
          : "cursor-pointer hover:border-[var(--text-primary)] active:opacity-80"
      )}
    >
      <div className="flex items-start gap-[var(--space-3)]">
        <span className="text-[32px] leading-none select-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-subheading text-[var(--text-primary)]">{country}</div>
          <div className="text-small text-[var(--text-secondary)] mt-[2px] truncate">
            {visaName}
          </div>
          <div className="flex gap-[var(--space-4)] mt-[var(--space-2)]">
            <span className="text-caption text-[var(--text-tertiary)]">
              {duration}
            </span>
            <span className="text-caption text-[var(--text-tertiary)] tabular-nums">
              €{minIncome.toLocaleString()}/yr min
            </span>
          </div>
        </div>
        {featured && (
          <span className="text-label text-[var(--accent)] bg-[var(--accent-light)] px-[6px] py-[2px] rounded-[var(--radius-full)] shrink-0">
            Active
          </span>
        )}
        {comingSoon && (
          <span className="text-label text-[var(--text-tertiary)] bg-[var(--bg)] px-[6px] py-[2px] rounded-[var(--radius-full)] shrink-0">
            Soon
          </span>
        )}
      </div>
    </button>
  );
}
