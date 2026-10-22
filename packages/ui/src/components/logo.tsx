import { APP_NAME } from "@kedge/config";
import { cn } from "../cn";

/** Product mark: a kedge anchor in a rounded tile, plus the product name. */
export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-foreground", className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <g fill="none" className="stroke-primary-foreground" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="16" cy="8.5" r="2.5" />
          <path d="M16 11v13" />
          <path d="M11.5 15h9" />
          <path d="M8.5 19.5c1 3.2 4 5 7.5 5s6.5-1.8 7.5-5" />
        </g>
      </svg>
      {showName ? <span className="text-[17px]">{APP_NAME}</span> : <span className="sr-only">{APP_NAME}</span>}
    </span>
  );
}
