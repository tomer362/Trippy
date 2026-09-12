"use client";
import { RichNotes } from "@/components/notes/rich-notes";
import { saveTripNotes } from "@/server/actions/content";

/** Shared trip notes: tips, links and reminders everyone on the trip can see. */
export function TripNotesCard({
  tripId,
  initialContent,
  canEdit,
}: {
  tripId: string;
  initialContent: unknown;
  canEdit: boolean;
}) {
  return (
    <RichNotes
      initialContent={initialContent}
      canEdit={canEdit}
      onSave={(body) => saveTripNotes({ tripId, body })}
    />
  );
}
