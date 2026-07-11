import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        // base
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)]",
        "text-[15px] font-[500] leading-none",
        "transition-opacity duration-150 ease-out",
        // sizing: 44px min tap target
        "h-[44px] px-[20px]",
        // full-width
        fullWidth && "w-full",
        // variants
        variant === "primary" && [
          "bg-[var(--text-primary)] text-white",
          "hover:opacity-90 active:opacity-80",
          "disabled:opacity-30",
        ],
        variant === "secondary" && [
          "bg-transparent text-[var(--text-primary)]",
          "border border-[var(--border)]",
          "hover:border-[var(--text-primary)] active:opacity-80",
          "disabled:opacity-30",
        ],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
