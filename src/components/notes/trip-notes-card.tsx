"use client";
import { RichNotes } from "@/components/notes/rich-notes";
import { saveTripNotes } from "@/server/actions/content";

/** Shared trip notes: tips, links and reminders everyone on the trip can see. */
export function TripNotesCard({
  tripId,
  initialContent,
  initialVersion,
  canEdit,
}: {
  tripId: string;
  initialContent: unknown;
  initialVersion: number;
  canEdit: boolean;
}) {
  return (
    <RichNotes
      initialContent={initialContent}
      initialVersion={initialVersion}
      canEdit={canEdit}
      onSave={(body, expectedVersion) => saveTripNotes({ tripId, body, expectedVersion })}
    />
  );
}
