import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "myra-agents";

export function InAlert() {
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
