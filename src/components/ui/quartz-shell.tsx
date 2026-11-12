import { cn } from "@/lib/utils";
import { QuartzShellDecor } from "@/components/ui/quartz-shell-decor";

export function QuartzShell({
  children,
  className,
  tone = "quartz",
  theme = "dark",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "quartz" | "admin";
  theme?: "dark" | "light";
}) {
  if (tone === "admin") {
    return (
      <div className={cn("admin-shell quartz-shell relative min-h-dvh", className)} data-theme={theme}>
        <div className="relative z-[1] min-h-dvh">{children}</div>
      </div>
    );
  }

  return (
    <div className={cn("quartz-shell quartz-shell--bw relative min-h-dvh", className)}>
      <QuartzShellDecor />
      <div className="relative z-[1] min-h-dvh">{children}</div>
    </div>
  );
}
