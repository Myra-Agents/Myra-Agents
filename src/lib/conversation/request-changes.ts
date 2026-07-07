import type { KanbanCard } from "@/types/kanban";

// The backend stores feedback-question answers in the same `revisionNotes`
// list as user-requested changes, prefixing them so they can be told apart
// (see shared `domain/cards.ts` answerFeedback / server dispatch).
const ANSWER_PREFIX = "Answer to agent question:";

/**
 * The "Request changes" notes the user sent during a card's runs — i.e. its
 * revision notes minus the agent-question answers stored in the same list.
 * A non-empty result means the run's outcome needed correcting, which is the
 * signal behind "suggest a patrol change".
 */
export function requestChangeNotes(card: KanbanCard): string[] {
  return (card.revisionNotes ?? []).filter((note) => !note.startsWith(ANSWER_PREFIX));
}
