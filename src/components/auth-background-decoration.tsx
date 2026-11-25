import React from "react";

export function AuthBackgroundDecoration({ showOrbs = true }: { showOrbs?: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
      aria-hidden="true"
    >
      {/* ─── Richer Lime & Emerald Ambient Glow Orbs ─── */}
      {showOrbs ? (
        <>
          <div className="absolute -top-24 -left-24 w-96 h-96 sm:w-[500px] sm:h-[500px] rounded-full bg-emerald-300/30 blur-[90px]" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 sm:w-[500px] sm:h-[500px] rounded-full bg-lime-300/35 blur-[100px]" />
          <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-emerald-200/40 blur-[80px]" />
          <div className="absolute bottom-1/4 -left-20 w-80 h-80 rounded-full bg-lime-200/35 blur-[90px]" />
        </>
      ) : null}

      {/* ─── Translucent Floating Printer Emojis (Clearly Visible) ─── */}
      {/* Top Left Printer */}
      <div className="absolute top-[8%] left-[6%] sm:left-[10%] opacity-50 text-3xl sm:text-5xl animate-float-gentle filter drop-shadow-md">
        🖨️
      </div>

      {/* Top Right Printer */}
      <div className="absolute top-[12%] right-[8%] sm:right-[12%] opacity-45 text-4xl sm:text-6xl animate-float-reverse-gentle filter drop-shadow-md">
        🖨️
      </div>

      {/* Upper Mid Left Floating Sheet */}
      <div className="absolute top-[28%] left-[4%] sm:left-[8%] opacity-55 text-2xl sm:text-3xl animate-float-drift filter drop-shadow-xs">
        📄
      </div>

      {/* Upper Mid Right Printer */}
      <div className="hidden sm:block absolute top-[32%] right-[5%] opacity-40 text-3xl sm:text-4xl animate-float-gentle filter drop-shadow-sm">
        🖨️
      </div>

      {/* Lower Mid Left Printer */}
      <div className="hidden sm:block absolute bottom-[38%] left-[5%] opacity-40 text-3xl sm:text-4xl animate-float-reverse-gentle filter drop-shadow-sm">
        🖨️
      </div>

      {/* Lower Mid Right Sheet */}
      <div className="absolute bottom-[30%] right-[6%] sm:right-[9%] opacity-55 text-2xl sm:text-3xl animate-float-drift filter drop-shadow-xs">
        📄
      </div>

      {/* Bottom Left Printer */}
      <div className="absolute bottom-[10%] left-[8%] sm:left-[12%] opacity-50 text-4xl sm:text-6xl animate-float-gentle filter drop-shadow-md">
        🖨️
      </div>

      {/* Bottom Right Printer */}
      <div className="absolute bottom-[8%] right-[7%] sm:right-[11%] opacity-45 text-3xl sm:text-5xl animate-float-reverse-gentle filter drop-shadow-md">
        🖨️
      </div>

      {/* Top Center-Right Small Accent */}
      <div className="hidden md:block absolute top-[6%] right-[32%] opacity-40 text-2xl animate-float-drift">
        ✨
      </div>

      {/* Bottom Center-Left Small Accent */}
      <div className="hidden md:block absolute bottom-[8%] left-[32%] opacity-40 text-2xl animate-float-gentle">
        ✨
      </div>

      {/* ─── Translucent Floating Paper Sheet Frames ─── */}
      <div className="hidden lg:block absolute top-[18%] left-[20%] w-12 h-16 rounded-xl border-2 border-emerald-500/25 bg-emerald-500/5 rotate-12 opacity-60 backdrop-blur-xs animate-float-gentle" />
      <div className="hidden lg:block absolute bottom-[22%] right-[20%] w-14 h-20 rounded-xl border-2 border-lime-500/25 bg-lime-500/5 -rotate-12 opacity-60 backdrop-blur-xs animate-float-reverse-gentle" />
    </div>
  );
}
