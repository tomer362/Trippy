import "server-only";
import { del, get } from "@vercel/blob";
import { env, features } from "@/env";

/**
 * File storage lives behind this module so the provider can be swapped without touching
 * feature code. Uploads go straight from the browser to the store using a short-lived
 * client token, so bytes never pass through a serverless function.
 */
export type UploadKind = "attachment" | "journal" | "cover";

export const UPLOAD_LIMITS: Record<
  UploadKind,
  { maxBytes: number; contentTypes: string[]; access: "public" | "private" }
> = {
  // Tickets and confirmations: private, served through our own authorised route.
  attachment: {
    maxBytes: 12 * 1024 * 1024,
    contentTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "text/plain",
    ],
    access: "private",
  },
  // Journal photos and covers are shown to anyone who can see the trip.
  journal: {
    maxBytes: 8 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    access: "public",
  },
  cover: {
    maxBytes: 8 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    access: "public",
  },
};

export function safeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .slice(-80) || "file"
  );
}

export function storagePath(kind: UploadKind, tripId: string, filename: string): string {
  return `trips/${tripId}/${kind}/${safeFilename(filename)}`;
}

/** Reads the trip id back out of a stored path so access can be re-checked on download. */
export function tripIdFromPath(pathname: string): string | null {
  return pathname.match(/^trips\/([^/]+)\//)?.[1] ?? null;
}

export const storageEnabled = () => features.blob;

export async function deleteStored(url: string): Promise<void> {
  if (!features.blob) return;
  if (!isStoredBlobUrl(url)) {
    console.error("refusing to delete a URL that is not in our blob store", url);
    return;
  }
  try {
    await del(url, { token: env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    console.error("blob delete failed", err);
  }
}

/**
 * Vercel Blob serves public files from this host and nowhere else. Stored URLs originate from
 * the browser upload, so they are caller-controlled: anything not on this host must never be
 * redirected to or handed to the delete API.
 */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isStoredBlobUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.endsWith(BLOB_HOST_SUFFIX);
}

/** Streams a private file for an authorised viewer. */
export async function readPrivate(pathname: string) {
  if (!features.blob) return null;
  return get(pathname, { access: "private", token: env.BLOB_READ_WRITE_TOKEN });
}
