import { cn } from "@/lib/utils";

interface SegmentedToggleProps<T extends string> {
  options: readonly T[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  optionClassName?: string;
  activeOptionClassName?: string;
  inactiveOptionClassName?: string;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onValueChange,
  className,
  optionClassName,
  activeOptionClassName,
  inactiveOptionClassName,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="tablist"
      aria-label="Segmented toggle"
      className={cn(
        "grid gap-2 rounded-xl border border-primary-muted bg-black/20 p-1.5 font-sans text-xs font-normal tracking-[0.04em]",
        className,
      )}
    >
      {options.map((option) => {
        const active = option === value;

        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(option)}
            className={cn(
              "h-9 rounded-lg px-2 transition",
              optionClassName,
              active
                ? "border border-cyan-300/60 bg-cyan-400/20 text-cyan-100"
                : "border border-transparent bg-transparent text-primary-light/75 hover:bg-cyan-400/10 hover:text-cyan-100",
              active ? activeOptionClassName : inactiveOptionClassName,
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}