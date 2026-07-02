import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "myra-agents";

const runs = [
  { id: "run_9f2", card: "Refactor auth middleware", agent: "claude", status: "Running", elapsed: "2m 14s" },
  { id: "run_8a1", card: "Add cron scheduler tests", agent: "opencode", status: "Done", elapsed: "5m 02s" },
  { id: "run_7c4", card: "Fix sidecar port fallback", agent: "copilot", status: "Failed", elapsed: "0m 47s" },
  { id: "run_6b0", card: "Draft release notes v0.3.2", agent: "claude", status: "Waiting", elapsed: "1m 30s" },
];

function statusVariant(s: string) {
  if (s === "Done") return "default" as const;
  if (s === "Failed") return "destructive" as const;
  return "secondary" as const;
}

export function AgentRuns() {
  return (
    <Table style={{ width: 560 }}>
      <TableCaption>Recent agent runs on the local board</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Run</TableHead>
          <TableHead>Card</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Elapsed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
            <TableCell className="font-medium">{r.card}</TableCell>
            <TableCell>{r.agent}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.elapsed}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>Total</TableCell>
          <TableCell className="text-right tabular-nums">9m 33s</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
