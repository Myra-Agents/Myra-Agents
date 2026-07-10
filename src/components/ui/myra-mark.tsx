import { cn } from "@/lib/utils";
import { PATHS } from "./myra-loader";

/**
 * The static Myra mark (7 chevrons), for use as a logo/icon — e.g. the embedded
 * "Myra" agent in Settings. Fills with `currentColor` so it inherits text color
 * and themes automatically. For the animated version use {@link MyraLoader}.
 */
export function MyraMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 1024 938"
      fill="currentColor"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      {PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
