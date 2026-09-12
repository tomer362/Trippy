"use server";
import { and, eq, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findTemplate } from "@/lib/checklist-templates";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import {
  checklistItems,
  checklists,
  journalEntries,
  journalPhotos,
  listTemplates,
  tripNotes,
  trips,
} from "@/server/db/schema";
import { publishTripChange } from "@/server/services/realtime";
import { deleteStored, tripIdFromPath } from "@/server/services/storage";
import { action } from "./_helpers";

async function touch(tripId: string, path = "") {
  await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
  revalidatePath(`/t/${tripId}${path}`);
}

/* -------------------------------- notes --------------------------------- */

/** Rich-text notes are stored as the editor's own JSON document. */
export const saveTripNotes = action(
  z.object({ tripId: z.string(), body: z.unknown() }),
  async ({ tripId, body }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .insert(tripNotes)
      .values({ tripId, body })
      .onConflictDoUpdate({
        target: tripNotes.tripId,
        set: { body, version: sql`${tripNotes.version} + 1`, updatedAt: new Date() },
      });
    await touch(tripId);
    await publishTripChange(tripId, { entity: "trip", actorId: userId });
    return null;
  },
);

/* ------------------------------ checklists ------------------------------- */

const checklistKind = z.enum(["packing", "todo", "custom"]);

export const createChecklist = action(
  z.object({
    tripId: z.string(),
    title: z.string().trim().min(1).max(120),
    kind: checklistKind.default("custom"),
    dayIndex: z.number().int().min(0).max(120).nullable().optional(),
    items: z.array(z.string().trim().min(1).max(300)).max(200).default([]),
  }),
  async ({ tripId, title, kind, dayIndex, items }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const [row] = await db
      .select({ max: max(checklists.position) })
      .from(checklists)
      .where(eq(checklists.tripId, tripId));
    const [created] = await db
      .insert(checklists)
      .values({ tripId, title, kind, dayIndex: dayIndex ?? null, position: (row?.max ?? -1) + 1 })
      .returning();
    if (items.length > 0) {
      await db
        .insert(checklistItems)
        .values(items.map((text, position) => ({ checklistId: created!.id, text, position })));
    }
    await touch(tripId, "/checklists");
    await publishTripChange(tripId, { entity: "checklists", id: created!.id, actorId: userId });
    return { id: created!.id };
  },
);

/** Adds one of the built-in starter lists, or a list the user saved earlier. */
export const addChecklistFromTemplate = action(
  z.object({
    tripId: z.string(),
    templateKey: z.string().optional(),
    savedTemplateId: z.string().optional(),
  }),
  async ({ tripId, templateKey, savedTemplateId }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    let title: string;
    let kind: "packing" | "todo" | "custom" = "custom";
    let items: string[] = [];
    if (templateKey) {
      const template = findTemplate(templateKey);
      if (!template) throw new Error("Unknown template");
      title = template.title;
      kind = template.kind;
      items = template.items;
    } else if (savedTemplateId) {
      const [saved] = await db
        .select()
        .from(listTemplates)
        .where(and(eq(listTemplates.id, savedTemplateId), eq(listTemplates.userId, userId)))
        .limit(1);
      if (!saved) throw new Error("Saved list not found");
      title = saved.name;
      items = saved.items.map((i) => i.text);
    } else {
      throw new Error("Pick a template");
    }
    const [row] = await db
      .select({ max: max(checklists.position) })
      .from(checklists)
      .where(eq(checklists.tripId, tripId));
    const [created] = await db
      .insert(checklists)
      .values({ tripId, title, kind, position: (row?.max ?? -1) + 1 })
      .returning();
    if (items.length > 0) {
      await db
        .insert(checklistItems)
        .values(items.map((text, position) => ({ checklistId: created!.id, text, position })));
    }
    await touch(tripId, "/checklists");
    return { id: created!.id, items: items.length };
  },
);

export const updateChecklist = action(
  z.object({
    tripId: z.string(),
    id: z.string(),
    title: z.string().trim().min(1).max(120).optional(),
    dayIndex: z.number().int().min(0).max(120).nullable().optional(),
  }),
  async ({ tripId, id, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(checklists)
      .set({ ...patch, version: sql`${checklists.version} + 1` })
      .where(and(eq(checklists.id, id), eq(checklists.tripId, tripId)));
    await touch(tripId, "/checklists");
    return null;
  },
);

export const deleteChecklist = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db.delete(checklists).where(and(eq(checklists.id, id), eq(checklists.tripId, tripId)));
    await touch(tripId, "/checklists");
    return null;
  },
);

async function assertChecklistInTrip(tripId: string, checklistId: string) {
  const [row] = await db
    .select({ id: checklists.id })
    .from(checklists)
    .where(and(eq(checklists.id, checklistId), eq(checklists.tripId, tripId)))
    .limit(1);
  if (!row) throw new Error("Checklist not found");
}

export const addChecklistItem = action(
  z.object({
    tripId: z.string(),
    checklistId: z.string(),
    text: z.string().trim().min(1).max(300),
  }),
  async ({ tripId, checklistId, text }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertChecklistInTrip(tripId, checklistId);
    const [row] = await db
      .select({ max: max(checklistItems.position) })
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklistId));
    const [created] = await db
      .insert(checklistItems)
      .values({ checklistId, text, position: (row?.max ?? -1) + 1 })
      .returning();
    await touch(tripId, "/checklists");
    await publishTripChange(tripId, { entity: "checklists", id: checklistId, actorId: userId });
    return { id: created!.id };
  },
);

/** Ticking things off is allowed for viewers too: it is shared, not destructive. */
export const setChecklistItem = action(
  z.object({
    tripId: z.string(),
    checklistId: z.string(),
    id: z.string(),
    text: z.string().trim().min(1).max(300).optional(),
    done: z.boolean().optional(),
    assignedTo: z.string().nullable().optional(),
  }),
  async ({ tripId, checklistId, id, ...patch }, userId) => {
    const level = patch.text !== undefined || patch.assignedTo !== undefined ? "edit" : "view";
    await requireTripAccess(tripId, userId, level);
    await assertChecklistInTrip(tripId, checklistId);
    await db
      .update(checklistItems)
      .set(patch)
      .where(and(eq(checklistItems.id, id), eq(checklistItems.checklistId, checklistId)));
    await touch(tripId, "/checklists");
    await publishTripChange(tripId, { entity: "checklists", id: checklistId, actorId: userId });
    return null;
  },
);

export const removeChecklistItem = action(
  z.object({ tripId: z.string(), checklistId: z.string(), id: z.string() }),
  async ({ tripId, checklistId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertChecklistInTrip(tripId, checklistId);
    await db
      .delete(checklistItems)
      .where(and(eq(checklistItems.id, id), eq(checklistItems.checklistId, checklistId)));
    await touch(tripId, "/checklists");
    return null;
  },
);

export const reorderChecklistItems = action(
  z.object({
    tripId: z.string(),
    checklistId: z.string(),
    orderedIds: z.array(z.string()).max(300),
  }),
  async ({ tripId, checklistId, orderedIds }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertChecklistInTrip(tripId, checklistId);
    for (const [position, id] of orderedIds.entries()) {
      await db
        .update(checklistItems)
        .set({ position })
        .where(and(eq(checklistItems.id, id), eq(checklistItems.checklistId, checklistId)));
    }
    await touch(tripId, "/checklists");
    return null;
  },
);

/** Saves a checklist as a reusable template on the user's account. */
export const saveChecklistAsTemplate = action(
  z.object({ tripId: z.string(), checklistId: z.string() }),
  async ({ tripId, checklistId }, userId) => {
    await requireTripAccess(tripId, userId, "view");
    const [list] = await db
      .select()
      .from(checklists)
      .where(and(eq(checklists.id, checklistId), eq(checklists.tripId, tripId)))
      .limit(1);
    if (!list) throw new Error("Checklist not found");
    const items = await db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklistId))
      .orderBy(checklistItems.position);
    const [created] = await db
      .insert(listTemplates)
      .values({
        userId,
        name: list.title,
        kind: "checklist",
        items: items.map((i) => ({ text: i.text })),
      })
      .returning();
    return { id: created!.id, items: items.length };
  },
);

export const deleteSavedTemplate = action(z.object({ id: z.string() }), async ({ id }, userId) => {
  await db
    .delete(listTemplates)
    .where(and(eq(listTemplates.id, id), eq(listTemplates.userId, userId)));
  revalidatePath("/settings");
  return null;
});

/* -------------------------------- journal -------------------------------- */

export const addJournalEntry = action(
  z.object({
    tripId: z.string(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    dayIndex: z.number().int().min(0).max(120).nullable().optional(),
    title: z.string().max(200).nullable().optional(),
    body: z.unknown().optional(),
    mood: z.string().max(20).nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
  }),
  async (input, userId) => {
    await requireTripAccess(input.tripId, userId, "edit");
    const [created] = await db
      .insert(journalEntries)
      .values({
        tripId: input.tripId,
        authorId: userId,
        date: input.date ?? null,
        dayIndex: input.dayIndex ?? null,
        title: input.title ?? null,
        body: input.body ?? null,
        mood: input.mood ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      })
      .returning();
    await touch(input.tripId, "/journal");
    await publishTripChange(input.tripId, { entity: "journal", id: created!.id, actorId: userId });
    return { id: created!.id };
  },
);

export const updateJournalEntry = action(
  z.object({
    tripId: z.string(),
    id: z.string(),
    title: z.string().max(200).nullable().optional(),
    body: z.unknown().optional(),
    mood: z.string().max(20).nullable().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  }),
  async ({ tripId, id, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(journalEntries)
      .set({ ...patch, version: sql`${journalEntries.version} + 1` })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.tripId, tripId)));
    await touch(tripId, "/journal");
    return null;
  },
);

export const removeJournalEntry = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const photos = await db.select().from(journalPhotos).where(eq(journalPhotos.entryId, id));
    await db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.tripId, tripId)));
    for (const p of photos) await deleteStored(p.url);
    await touch(tripId, "/journal");
    return null;
  },
);

/** Records a photo the browser uploaded straight to storage. */
export const addJournalPhoto = action(
  z.object({
    tripId: z.string(),
    entryId: z.string(),
    url: z.string().url(),
    pathname: z.string().min(1),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    caption: z.string().max(300).nullable().optional(),
    takenAt: z.string().datetime().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
  }),
  async (input, userId) => {
    await requireTripAccess(input.tripId, userId, "edit");
    if (tripIdFromPath(input.pathname) !== input.tripId)
      throw new Error("That photo does not belong to this trip");
    const [row] = await db
      .select({ max: max(journalPhotos.position) })
      .from(journalPhotos)
      .where(eq(journalPhotos.entryId, input.entryId));
    const [created] = await db
      .insert(journalPhotos)
      .values({
        entryId: input.entryId,
        tripId: input.tripId,
        url: input.url,
        storageKey: input.pathname,
        width: input.width ?? null,
        height: input.height ?? null,
        caption: input.caption ?? null,
        takenAt: input.takenAt ? new Date(input.takenAt) : null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        position: (row?.max ?? -1) + 1,
        uploadedBy: userId,
      })
      .returning();
    await touch(input.tripId, "/journal");
    await publishTripChange(input.tripId, {
      entity: "journal",
      id: input.entryId,
      actorId: userId,
    });
    return { id: created!.id };
  },
);

export const removeJournalPhoto = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const [row] = await db
      .select()
      .from(journalPhotos)
      .where(and(eq(journalPhotos.id, id), eq(journalPhotos.tripId, tripId)))
      .limit(1);
    if (!row) throw new Error("Photo not found");
    await db.delete(journalPhotos).where(eq(journalPhotos.id, id));
    await deleteStored(row.url);
    await touch(tripId, "/journal");
    return null;
  },
);

export const setPhotoCaption = action(
  z.object({ tripId: z.string(), id: z.string(), caption: z.string().max(300).nullable() }),
  async ({ tripId, id, caption }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(journalPhotos)
      .set({ caption })
      .where(and(eq(journalPhotos.id, id), eq(journalPhotos.tripId, tripId)));
    await touch(tripId, "/journal");
    return null;
  },
);

/** Seeds a journal from the itinerary so each stop is ready for photos and notes. */
export const seedJournalFromItinerary = action(
  z.object({ tripId: z.string() }),
  async ({ tripId }, userId) => {
    const access = await requireTripAccess(tripId, userId, "edit");
    const { getItinerary } = await import("@/server/queries/itinerary");
    const days = await getItinerary(tripId, access.trip.defaultTravelMode);
    const existing = await db
      .select({ dayIndex: journalEntries.dayIndex })
      .from(journalEntries)
      .where(eq(journalEntries.tripId, tripId));
    const seeded = new Set(existing.map((e) => e.dayIndex));
    const toCreate = days.filter((d) => d.items.some((i) => i.place) && !seeded.has(d.dayIndex));
    if (toCreate.length === 0) return { created: 0 };
    await db.insert(journalEntries).values(
      toCreate.map((d) => ({
        tripId,
        authorId: userId,
        date: d.date,
        dayIndex: d.dayIndex,
        title: d.title ?? `Day ${d.dayIndex + 1}`,
        mood: null,
      })),
    );
    await touch(tripId, "/journal");
    return { created: toCreate.length };
  },
);
