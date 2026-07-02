import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "myra-agents";

export function NewRunDialog() {
  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New run</DialogTitle>
          <DialogDescription>
            Launch a coding agent against a card. It runs headless and streams
            output back to the board.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Prompt</span>
            <textarea
              defaultValue="Refactor the auth middleware and re-run the suite."
              rows={3}
              style={{
                resize: "none",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--background)",
                padding: 8,
                fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Agent</span>
            <select
              defaultValue="claude"
              style={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--background)",
                padding: "6px 8px",
                fontSize: 13,
              }}
            >
              <option value="claude">claude</option>
              <option value="opencode">opencode</option>
            </select>
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Launch run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
