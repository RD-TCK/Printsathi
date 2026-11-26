import React from "react";

export function AuthBackgroundDecoration({ showOrbs = true }: { showOrbs?: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
      aria-hidden="true"
    >
      <div
        className={
          showOrbs
            ? "absolute inset-0 bg-gradient-to-b from-slate-50/90 via-white to-slate-50/70 dark:from-[#161d2b] dark:via-[#121722] dark:to-[#171f2f]"
            : "absolute inset-0 bg-white dark:bg-[#121722]"
        }
      />
    </div>
  );
}
