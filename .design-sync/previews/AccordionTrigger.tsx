import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "myra-agents";

export function RunDetails() {
  return (
    <Accordion type="single" defaultValue="steps" collapsible style={{ width: 420 }}>
      <AccordionItem value="steps">
        <AccordionTrigger>Execution steps</AccordionTrigger>
        <AccordionContent>
          <p>Spawned the claude binary in headless mode, read the auth
          middleware, applied a one-line guard fix, then re-ran the suite.</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="env">
        <AccordionTrigger>Environment</AccordionTrigger>
        <AccordionContent>
          Working dir <code>~/projects/api</code> · sidecar port 4319.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="artifacts">
        <AccordionTrigger>Artifacts</AccordionTrigger>
        <AccordionContent>
          Full log at <a href="#">agent-runs/run_9f2.log</a>.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
