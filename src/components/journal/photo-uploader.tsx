"use client";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addJournalPhoto } from "@/server/actions/content";

const MAX_EDGE = 1600;

/**
 * Resizes each photo in the browser before uploading, so a phone camera's 5 MB original
 * becomes a few hundred kilobytes and the trip's storage allowance lasts.
 */
async function shrink(
  file: File,
): Promise<{ blob: Blob; width: number; height: number; type: string }> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { blob: file, width: bitmap.width, height: bitmap.height, type: file.type };
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  return blob
    ? { blob, width, height, type: "image/webp" }
    : { blob: file, width, height, type: file.type };
}

export function PhotoUploader({
  tripId,
  entryId,
  enabled,
  onDone,
}: {
  tripId: string;
  entryId: string;
  enabled: boolean;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const { blob, width, height, type } = await shrink(file);
        const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : "");
        const stored = await upload(`trips/${tripId}/journal/${name}`, blob, {
          access: "public",
          handleUploadUrl: "/api/uploads",
          clientPayload: JSON.stringify({ tripId, kind: "journal" }),
          contentType: type,
        });
        const res = await addJournalPhoto({
          tripId,
          entryId,
          url: stored.url,
          pathname: stored.pathname,
          width,
          height,
          takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        });
        if (!res.ok) throw new Error(res.error);
      }
      toast.success("Photos added");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!enabled)
    return (
      <p className="text-xs text-muted-foreground">
        Photo uploads need a storage token. See docs/SETUP.md.
      </p>
    );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handle(e.target.files)}
        className="hidden"
        aria-label="Add photos"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add photos
      </Button>
    </>
  );
}
