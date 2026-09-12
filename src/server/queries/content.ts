import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  checklistItems,
  checklists,
  journalEntries,
  journalPhotos,
  listTemplates,
  tripNotes,
  user,
} from "@/server/db/schema";

export type ChecklistItemDTO = {
  id: string;
  text: string;
  done: boolean;
  assignedTo: string | null;
  assignedName: string | null;
  position: number;
};

export type ChecklistDTO = {
  id: string;
  title: string;
  kind: "packing" | "todo" | "custom";
  dayIndex: number | null;
  position: number;
  version: number;
  items: ChecklistItemDTO[];
};

export async function getChecklists(tripId: string): Promise<ChecklistDTO[]> {
  const [lists, items] = await Promise.all([
    db
      .select()
      .from(checklists)
      .where(eq(checklists.tripId, tripId))
      .orderBy(asc(checklists.position)),
    db
      .select({
        i: checklistItems,
        assignedName: user.name,
        checklistId: checklistItems.checklistId,
      })
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .leftJoin(user, eq(user.id, checklistItems.assignedTo))
      .where(eq(checklists.tripId, tripId))
      .orderBy(asc(checklistItems.position)),
  ]);
  const byList = new Map<string, ChecklistItemDTO[]>();
  for (const row of items) {
    const list = byList.get(row.checklistId) ?? [];
    list.push({
      id: row.i.id,
      text: row.i.text,
      done: row.i.done,
      assignedTo: row.i.assignedTo,
      assignedName: row.assignedName ?? null,
      position: row.i.position,
    });
    byList.set(row.checklistId, list);
  }
  return lists.map((l) => ({
    id: l.id,
    title: l.title,
    kind: l.kind,
    dayIndex: l.dayIndex,
    position: l.position,
    version: l.version,
    items: byList.get(l.id) ?? [],
  }));
}

export async function getTripNotes(tripId: string): Promise<{ body: unknown; version: number }> {
  const [row] = await db.select().from(tripNotes).where(eq(tripNotes.tripId, tripId)).limit(1);
  return { body: row?.body ?? null, version: row?.version ?? 0 };
}

export type JournalPhotoDTO = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
};

export type JournalEntryDTO = {
  id: string;
  date: string | null;
  dayIndex: number | null;
  title: string | null;
  body: unknown;
  mood: string | null;
  lat: number | null;
  lng: number | null;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  createdAt: string;
  version: number;
  photos: JournalPhotoDTO[];
};

export async function getJournal(tripId: string): Promise<JournalEntryDTO[]> {
  const [entries, photos] = await Promise.all([
    db
      .select({ e: journalEntries, authorName: user.name, authorImage: user.image })
      .from(journalEntries)
      .leftJoin(user, eq(user.id, journalEntries.authorId))
      .where(eq(journalEntries.tripId, tripId))
      .orderBy(asc(journalEntries.date), asc(journalEntries.createdAt)),
    db
      .select()
      .from(journalPhotos)
      .where(eq(journalPhotos.tripId, tripId))
      .orderBy(asc(journalPhotos.position)),
  ]);
  const byEntry = new Map<string, JournalPhotoDTO[]>();
  for (const p of photos) {
    const list = byEntry.get(p.entryId) ?? [];
    list.push({
      id: p.id,
      url: p.url,
      width: p.width,
      height: p.height,
      caption: p.caption,
      lat: p.lat,
      lng: p.lng,
      takenAt: p.takenAt?.toISOString() ?? null,
    });
    byEntry.set(p.entryId, list);
  }
  return entries.map(({ e, authorName, authorImage }) => ({
    id: e.id,
    date: e.date,
    dayIndex: e.dayIndex,
    title: e.title,
    body: e.body,
    mood: e.mood,
    lat: e.lat,
    lng: e.lng,
    authorId: e.authorId,
    authorName: authorName ?? null,
    authorImage: authorImage ?? null,
    createdAt: e.createdAt.toISOString(),
    version: e.version,
    photos: byEntry.get(e.id) ?? [],
  }));
}

export async function getSavedTemplates(userId: string) {
  return db
    .select()
    .from(listTemplates)
    .where(eq(listTemplates.userId, userId))
    .orderBy(desc(listTemplates.createdAt));
}
