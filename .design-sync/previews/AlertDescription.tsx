import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "myra-agents";

export function InAlert() {
  return (
    <Alert style={{ maxWidth: 440 }}>
      <AlertTitle>Sidecar connected</AlertTitle>
      <AlertDescription>
        The local myra-server is running on port 4319. Runs will stream to the
        board.
      </AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline">
          View logs
        </Button>
      </AlertAction>
    </Alert>
  );
}
