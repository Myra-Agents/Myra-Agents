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

export function InCard() {
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
