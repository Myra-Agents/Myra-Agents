import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "myra-agents";

export function Default() {
  return (
    <Alert style={{ maxWidth: 440 }}>
      <AlertTitle>Sidecar connected</AlertTitle>
      <AlertDescription>
        The local myra-server is running on port 4319. Runs will stream to the
        board.
      </AlertDescription>
    </Alert>
  );
}

export function Destructive() {
  return (
    <Alert variant="destructive" style={{ maxWidth: 440 }}>
      <AlertTitle>Agent run failed</AlertTitle>
      <AlertDescription>
        The configured binary exited with code 127. Check that the agent preset
        points at an executable on PATH.
      </AlertDescription>
    </Alert>
  );
}

export function WithAction() {
  return (
    <Alert style={{ maxWidth: 440 }}>
      <AlertTitle>Update available</AlertTitle>
      <AlertDescription>Version 0.3.2 is ready to install.</AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline">
          Install
        </Button>
      </AlertAction>
    </Alert>
  );
}
