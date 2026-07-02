import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "myra-agents";

export function TaskCard() {
  return (
    <Card style={{ width: 320 }}>
      <CardHeader>
        <CardTitle>Refactor auth middleware</CardTitle>
        <CardDescription>Running · claude · 2m 14s elapsed</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            ⋯
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>
          Token expiry check uses <code>{"<"}</code> instead of{" "}
          <code>{"<="}</code>. Patching the guard and re-running the suite.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="outline">
          Open run
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Small() {
  return (
    <Card size="sm" style={{ width: 260 }}>
      <CardHeader>
        <CardTitle>Nightly schedule</CardTitle>
        <CardDescription>Next: 02:00 · daily</CardDescription>
      </CardHeader>
      <CardContent>3 cards will materialize.</CardContent>
    </Card>
  );
}
