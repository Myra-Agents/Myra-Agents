import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "myra-agents";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

const data = [
  { day: "Mon", done: 8, failed: 1 },
  { day: "Tue", done: 12, failed: 2 },
  { day: "Wed", done: 9, failed: 0 },
  { day: "Thu", done: 14, failed: 3 },
  { day: "Fri", done: 11, failed: 1 },
  { day: "Sat", done: 4, failed: 0 },
  { day: "Sun", done: 3, failed: 1 },
];

const config = {
  done: { label: "Completed", color: "var(--chart-1)" },
  failed: { label: "Failed", color: "var(--chart-2)" },
};

export function RunsPerDay() {
  return (
    <ChartContainer
      config={config}
      className="!aspect-auto"
      style={{ width: 440, height: 260 }}
      initialDimension={{ width: 440, height: 260 }}
    >
      <BarChart data={data} width={440} height={260}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip defaultIndex={3} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="done" fill="var(--color-done)" radius={4} isAnimationActive={false} />
        <Bar dataKey="failed" fill="var(--color-failed)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
