import { clsx } from "clsx";

type BadgeVariant = "personalized" | "time" | "cost" | "important";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const STYLES: Record<BadgeVariant, string> = {
  personalized: "bg-[var(--accent-light)] text-[var(--accent)]",
  time:
    "bg-[#F3F4F6] text-[var(--text-secondary)]",
  cost:
    "bg-[#FFFBEB] text-[#92400E]",
  important:
    "bg-[var(--error-light)] text-[var(--error)]",
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-[6px] py-[2px] text-label rounded-[var(--radius-full)]",
        STYLES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
