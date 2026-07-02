import { cn } from "@/lib/utils";

// The 7 chevrons of the Myra mark.
const PATHS = [
  "M10.6654 460.598C-0.349946 460.497 -2.83271 455.91 3.2171 446.836L89.6937 317.124C95.7434 308.049 104.276 303.563 115.291 303.661L240.445 304.791C251.46 304.892 259.129 310.009 263.454 320.143L312.593 435.293C316.918 445.427 316.056 455.031 310.007 464.107L223.53 593.819C217.481 602.893 212.292 602.363 207.967 592.227L158.828 477.079C154.504 466.944 146.833 461.826 135.818 461.728L10.6654 460.598Z",
  "M213.11 156.937C202.094 156.838 199.612 152.251 205.661 143.176L292.138 13.4641C298.187 4.38963 306.72 -0.0978687 317.736 0.00161833L442.888 1.13196C453.903 1.23145 461.574 6.34861 465.899 16.4834L515.038 131.632C519.363 141.767 518.501 151.372 512.449 160.446L425.975 290.159C419.923 299.233 414.737 298.702 410.412 288.568L361.273 173.419C356.947 163.284 349.277 158.167 338.263 158.067L213.11 156.937Z",
  "M165.241 777.3C154.226 777.199 151.743 772.612 157.793 763.538L244.27 633.826C250.319 624.752 258.852 620.265 269.868 620.364L395.019 621.493C406.035 621.594 413.706 626.711 418.031 636.845L467.17 751.995C471.493 762.129 470.632 771.735 464.581 780.809L378.104 910.521C372.055 919.595 366.869 919.065 362.543 908.93L313.405 793.782C309.079 783.646 301.409 778.529 290.393 778.43L165.241 777.3Z",
  "M365.016 477.643C354.001 477.543 351.518 472.957 357.568 463.883L444.044 334.169C450.095 325.095 458.627 320.608 469.642 320.707L594.796 321.838C605.81 321.937 613.48 327.054 617.806 337.19L666.945 452.338C671.27 462.472 670.407 472.078 664.358 481.152L577.881 610.864C571.83 619.938 566.644 619.408 562.318 609.273L513.18 494.125C508.854 483.989 501.185 478.874 490.17 478.773L365.016 477.643Z",
  "M564.791 177.987C553.777 177.887 551.293 173.3 557.344 164.226L643.819 34.5136C649.87 25.439 658.402 20.9516 669.417 21.0511L794.571 22.1814C805.586 22.2809 813.255 27.3979 817.581 37.5329L866.719 152.682C871.045 162.816 870.182 172.421 864.133 181.496L777.656 311.207C771.607 320.281 766.419 319.752 762.093 309.618L712.954 194.468C708.631 184.334 700.96 179.216 689.945 179.117L564.791 177.987Z",
  "M516.923 798.348C505.907 798.249 503.425 793.662 509.476 784.588L595.951 654.876C602.002 645.802 610.533 641.313 621.549 641.414L746.703 642.543C757.718 642.644 765.387 647.759 769.712 657.895L818.851 773.043C823.177 783.179 822.314 792.783 816.264 801.857L729.788 931.571C723.739 940.645 718.55 940.113 714.225 929.98L665.086 814.83C660.763 804.696 653.092 799.579 642.076 799.48L516.923 798.348Z",
  "M719.368 494.689C708.352 494.59 705.87 490.002 711.919 480.928L798.396 351.216C804.445 342.142 812.978 337.653 823.994 337.754L949.146 338.884C960.161 338.983 967.832 344.1 972.157 354.236L1021.3 469.384C1025.62 479.519 1024.76 489.123 1018.71 498.198L932.232 627.909C926.181 636.984 920.995 636.454 916.67 626.32L867.531 511.17C863.205 501.036 855.535 495.919 844.521 495.818L719.368 494.689Z",
];

// Sequence the chevrons follow (indices into PATHS), matching the badge numbering
// Default chevron sequence (indices into PATHS), matching the badge numbering #1→#7:
// rightmost, top-right, top-left, bottom-center, center, mid-left, bottom-left.
const DEFAULT_ORDER = [6, 4, 1, 5, 3, 0, 2];

type MyraLoaderVariant = "shimmer" | "assemble";

// Per-variant defaults for every tunable knob (all overridable via props).
const VARIANTS: Record<MyraLoaderVariant, { dur: number; staggerSpan: number; distance: number; minOpacity: number }> =
  {
    // Continuous diagonal opacity/drift wave — stagger spread across the whole loop, small drift.
    shimmer: { dur: 1.3, staggerSpan: 1, distance: 24, minOpacity: 0.22 },
    // Slide in → hold → slide out like the GIF — short stagger (so it fully assembles before
    // leaving), long slide off-canvas.
    assemble: { dur: 2.5, staggerSpan: 0.28, distance: 380, minOpacity: 0 },
  };

interface MyraLoaderProps extends Omit<React.SVGProps<SVGSVGElement>, "opacity" | "order"> {
  /** Rendered size in px (width; height keeps the 1024×938 ratio). */
  size?: number;
  /** `shimmer` (default) pulses in place; `assemble` slides the chevrons in/out like the GIF. */
  variant?: MyraLoaderVariant;
  /** Loop speed multiplier — 2 = twice as fast. Ignored when `duration` is set. */
  speed?: number;
  /** Loop duration in seconds. Overrides the variant default and `speed`. */
  duration?: number;
  /** Fraction of the loop (0–1) the per-chevron stagger spans — bigger = more spread out. */
  staggerSpan?: number;
  /** Slide/drift distance in viewBox units (1024×938 space). */
  distance?: number;
  /** Dim opacity floor for the resting chevrons (shimmer). */
  minOpacity?: number;
  /** CSS animation-timing-function. */
  easing?: string;
  /** Chevron sequence — indices 0–6 into the 7 paths. Defaults to the badge order #1→#7. */
  order?: number[];
}

/**
 * Animated Myra mark used as an in-progress indicator. `shimmer` pulses the 7
 * chevrons in a diagonal opacity/drift wave; `assemble` slides them in one by one,
 * holds, then slides them out (like the exported GIF). Fill is `currentColor` — set
 * the color via `text-*`. Every timing/geometry knob is overridable via props.
 * Honors `prefers-reduced-motion` (renders a static mark).
 */
function MyraLoader({
  size = 20,
  variant = "shimmer",
  speed = 1,
  duration,
  staggerSpan,
  distance,
  minOpacity,
  easing,
  order = DEFAULT_ORDER,
  className,
  style,
  ...props
}: MyraLoaderProps) {
  const v = VARIANTS[variant];
  const dur = duration ?? v.dur / speed;
  const span = staggerSpan ?? v.staggerSpan;
  const dist = distance ?? v.distance;
  const minOp = minOpacity ?? v.minOpacity;

  const cssVars: React.CSSProperties = {
    "--myra-loader-dur": `${dur}s`,
    "--myra-dist": `${dist}px`,
    "--myra-min-op": `${minOp}`,
    ...(easing ? { "--myra-ease": easing } : {}),
  } as React.CSSProperties;

  return (
    <svg
      role="status"
      aria-label="Loading"
      data-variant={variant}
      viewBox="0 0 1024 938"
      width={size}
      height={(size * 938) / 1024}
      className={cn("myra-loader text-foreground", className)}
      style={{ ...cssVars, ...style }}
      {...props}
    >
      {PATHS.map((d, p) => (
        <g key={p} style={{ animationDelay: `${((order.indexOf(p) / order.length) * span * dur).toFixed(3)}s` }}>
          <path d={d} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/** All selectable loader animations (for settings/validation). */
export const MYRA_LOADER_VARIANTS = ["shimmer", "assemble"] as const satisfies readonly MyraLoaderVariant[];

export type { MyraLoaderVariant };

export { MyraLoader };
