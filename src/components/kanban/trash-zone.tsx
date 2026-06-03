"use client";

import { useDroppable } from "@dnd-kit/core";
import { TrashIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrashDropZoneProps {
  dropId: string;
  visible: boolean;
}

export function TrashDropZone({ dropId, visible }: TrashDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  if (!visible) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "fixed left-0 right-0 bottom-0 z-30 h-20 flex items-center justify-center border-t-2 transition-all duration-150",
        isOver
          ? "bg-destructive/20 border-destructive"
          : "bg-destructive/5 border-destructive/30 border-dashed",
      )}
    >
      <div className="flex items-center gap-3">
        <TrashIcon className={cn("size-5", isOver ? "text-destructive" : "text-muted-foreground")} />
        <span className="text-sm font-medium text-foreground">
          {isOver ? "Release to trash" : "Drag here to trash"}
        </span>
      </div>
    </div>
  );
}
