import { ScrollArea } from "myra-agents";

const lines = [
  "[10:02:14] spawning claude · headless",
  "[10:02:16] reading src/lib/auth.ts",
  "[10:02:17] reading src/lib/session.ts",
  "[10:02:19] token expiry guard uses < instead of <=",
  "[10:02:20] applying patch to auth.ts",
  "[10:02:22] re-running vitest suite",
  "[10:02:31] 128 passed, 0 failed",
  "[10:02:32] staging changes",
  "[10:02:33] run complete · exit 0",
];

export function RunLog() {
  return (
    <ScrollArea className="h-40 w-80 rounded-md border">
      <div className="p-3 font-mono text-xs leading-relaxed">
        {lines.concat(lines).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </ScrollArea>
  );
}
