"use client";

import { useState } from "react";
import type { KanbanCard } from "@/types/kanban";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FeedbackModalProps {
  open: boolean;
  card: KanbanCard | null;
  onSubmit: (id: string, answer: string) => Promise<void>;
  onClose: () => void;
}

export function FeedbackModal({ open, card, onSubmit, onClose }: FeedbackModalProps) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || !answer.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(card.id, answer.trim());
      setAnswer("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Answer Agent Question</DialogTitle>
          <DialogDescription>
            The agent is waiting for your input on &ldquo;{card?.title}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {card?.agentQuestion && (
          <div className="bg-muted rounded-md p-3">
            <p className="text-sm italic text-foreground">&ldquo;{card.agentQuestion}&rdquo;</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-answer">Your answer</Label>
            <Textarea
              id="feedback-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              rows={4}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!answer.trim() || submitting}>
              {submitting ? "Sending…" : "Send Answer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ReviewModalProps {
  open: boolean;
  card: KanbanCard | null;
  onApprove: (id: string) => Promise<void>;
  onRevise: (id: string, note: string) => Promise<void>;
  onClose: () => void;
}

export function ReviewModal({ open, card, onApprove, onRevise, onClose }: ReviewModalProps) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    if (!card) return;
    setSubmitting(true);
    try {
      await onApprove(card.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || !note.trim()) return;
    setSubmitting(true);
    try {
      await onRevise(card.id, note.trim());
      setNote("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review Result</DialogTitle>
          <DialogDescription>
            Review the agent&apos;s work on &ldquo;{card?.title}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {card?.agentResult && (
          <div className="bg-muted rounded-md p-3 max-h-40 overflow-y-auto">
            <p className="text-sm text-foreground whitespace-pre-wrap">{card.agentResult}</p>
          </div>
        )}

        <form onSubmit={handleRevise} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="revision-note">Revision note (to send back for rework)</Label>
            <Textarea
              id="revision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe what needs to change..."
              rows={3}
            />
          </div>

          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={!note.trim() || submitting}>
              Revise
            </Button>
            <Button type="button" onClick={handleApprove} disabled={submitting}>
              ✓ Approve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
