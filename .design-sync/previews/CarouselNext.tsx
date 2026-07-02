import {
  Card,
  CardContent,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "myra-agents";

const slides = [
  { title: "Refactor auth middleware", meta: "claude · Done · 5m 02s" },
  { title: "Add cron scheduler tests", meta: "opencode · Running · 2m 14s" },
  { title: "Fix sidecar port fallback", meta: "copilot · Failed · 0m 47s" },
];

export function RunReel() {
  return (
    <div style={{ padding: "0 56px", width: 360 }}>
      <Carousel opts={{ align: "start" }}>
        <CarouselContent>
          {slides.map((s) => (
            <CarouselItem key={s.title}>
              <Card>
                <CardContent className="flex h-28 flex-col justify-center gap-1 p-4">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.meta}</div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
