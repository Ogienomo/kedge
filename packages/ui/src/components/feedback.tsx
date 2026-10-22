import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-subtle text-foreground",
      primary: "bg-accent text-accent-foreground",
      success: "bg-success-subtle text-success",
      warning: "bg-warning-subtle text-warning",
      danger: "bg-danger-subtle text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;

const alertTone = {
  info: "border-border bg-subtle text-foreground",
  success: "border-success/30 bg-success-subtle text-foreground",
  warning: "border-warning/30 bg-warning-subtle text-foreground",
  danger: "border-danger/30 bg-danger-subtle text-foreground",
} as const;

const iconTone = { info: "text-muted", success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

export interface AlertProps extends Omit<ComponentProps<"div">, "title"> {
  tone?: keyof typeof alertIcons;
  title?: ReactNode;
}

/** Inline message. Colour is never the only signal: every tone has an icon and text. */
export function Alert({ tone = "info", title, children, className, ...props }: AlertProps) {
  const Icon = alertIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3 text-sm", alertTone[tone], className)} {...props}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconTone[tone])} />
      <div className="grid gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-subtle", className)} {...props} />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 aria-hidden className={cn("size-4 animate-spin", className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      {icon ? <div className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5">{icon}</div> : null}
      <div className="grid max-w-sm gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-subtle px-1 font-mono text-[11px] text-muted", className)} {...props} />;
}

export function Separator({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("border-border", className)} {...props} />;
}
