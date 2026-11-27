import React from "react";

export function AuthBackgroundDecoration({ showOrbs = true }: { showOrbs?: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
      aria-hidden="true"
    >
      {/* Subtle dark-mode canvas backdrop while preserving the emerald/lime light gradient on auth <main> */}
      <div className="hidden dark:block absolute inset-0 bg-gradient-to-b from-[#161d2b] via-[#121722] to-[#171f2f]" />

      {/* Subtle blueprint dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.16]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(16, 185, 129, 0.24) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Rich lime & emerald ambient glow orbs */}
      {showOrbs ? (
        <>
          <div className="absolute -top-24 -left-24 w-96 h-96 sm:w-[500px] sm:h-[500px] rounded-full bg-emerald-300/30 dark:bg-emerald-500/15 blur-[90px]" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 sm:w-[500px] sm:h-[500px] rounded-full bg-lime-300/35 dark:bg-teal-500/15 blur-[100px]" />
          <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-emerald-200/40 dark:bg-emerald-400/10 blur-[80px]" />
          <div className="absolute bottom-1/4 -left-20 w-80 h-80 rounded-full bg-lime-200/35 dark:bg-cyan-500/10 blur-[90px]" />
        </>
      ) : null}

      {/* Translucent floating printer & document accents */}
      <div className="absolute top-[8%] left-[6%] sm:left-[10%] opacity-50 dark:opacity-35 text-3xl sm:text-5xl animate-float-gentle filter drop-shadow-md">
        🖨️
      </div>
      <div className="absolute top-[12%] right-[8%] sm:right-[12%] opacity-45 dark:opacity-30 text-4xl sm:text-6xl animate-float-reverse-gentle filter drop-shadow-md">
        🖨️
      </div>
      <div className="absolute top-[28%] left-[4%] sm:left-[8%] opacity-55 dark:opacity-35 text-2xl sm:text-3xl animate-float-drift filter drop-shadow-xs">
        📄
      </div>
      <div className="hidden sm:block absolute top-[32%] right-[5%] opacity-40 dark:opacity-25 text-3xl sm:text-4xl animate-float-gentle filter drop-shadow-sm">
        🖨️
      </div>
      <div className="hidden sm:block absolute bottom-[38%] left-[5%] opacity-40 dark:opacity-25 text-3xl sm:text-4xl animate-float-reverse-gentle filter drop-shadow-sm">
        🖨️
      </div>
      <div className="absolute bottom-[30%] right-[6%] sm:right-[9%] opacity-55 dark:opacity-35 text-2xl sm:text-3xl animate-float-drift filter drop-shadow-xs">
        📄
      </div>
      <div className="absolute bottom-[10%] left-[8%] sm:left-[12%] opacity-50 dark:opacity-35 text-4xl sm:text-6xl animate-float-gentle filter drop-shadow-md">
        🖨️
      </div>
      <div className="absolute bottom-[8%] right-[7%] sm:right-[11%] opacity-45 dark:opacity-30 text-3xl sm:text-5xl animate-float-reverse-gentle filter drop-shadow-md">
        🖨️
      </div>
      <div className="hidden md:block absolute top-[6%] right-[32%] opacity-40 dark:opacity-30 text-2xl animate-float-drift">
        ✨
      </div>
      <div className="hidden md:block absolute bottom-[8%] left-[32%] opacity-40 dark:opacity-30 text-2xl animate-float-gentle">
        ✨
      </div>

      {/* Translucent floating paper sheet frames */}
      <div className="hidden lg:block absolute top-[18%] left-[20%] w-12 h-16 rounded-xl border-2 border-emerald-500/25 dark:border-emerald-400/25 bg-emerald-500/5 rotate-12 opacity-60 backdrop-blur-xs animate-float-gentle" />
      <div className="hidden lg:block absolute bottom-[22%] right-[20%] w-14 h-20 rounded-xl border-2 border-lime-500/25 dark:border-emerald-400/20 bg-lime-500/5 -rotate-12 opacity-60 backdrop-blur-xs animate-float-reverse-gentle" />
    </div>
  );
}
