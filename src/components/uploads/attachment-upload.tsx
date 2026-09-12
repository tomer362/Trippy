"use client";
import { upload } from "@vercel/blob/client";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerAttachment, removeAttachment } from "@/server/actions/bookings";
import type { AttachmentDTO } from "@/server/queries/bookings";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uploads straight from the browser to blob storage using a scoped token, then records the
 * file against the trip. Tickets stay private and are served through an authorised route.
 */
export function AttachmentUpload({
  tripId,
  entityType,
  entityId,
  attachments,
  canEdit,
  enabled,
  onChanged,
}: {
  tripId: string;
  entityType: "trip" | "lodging" | "reservation" | "expense" | "journal";
  entityId: string;
  attachments: AttachmentDTO[];
  canEdit: boolean;
  enabled: boolean;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await upload(`trips/${tripId}/attachment/${file.name}`, file, {
          access: "private",
          handleUploadUrl: "/api/uploads",
          clientPayload: JSON.stringify({ tripId, kind: "attachment" }),
          contentType: file.type || "application/octet-stream",
        });
        const res = await registerAttachment({
          tripId,
          entityType,
          entityId,
          kind: "attachment",
          url: blob.url,
          pathname: blob.pathname,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
        });
        if (!res.ok) throw new Error(res.error);
      }
      toast.success("Uploaded");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {a.filename}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.size)}</span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  onClick={() =>
                    start(async () => {
                      const res = await removeAttachment({ tripId, id: a.id });
                      if (!res.ok) toast.error(res.error);
                      else onChanged();
                    })
                  }
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (enabled ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/*,text/plain"
              onChange={(e) => void handleFiles(e.target.files)}
              className="hidden"
              aria-label="Attach files"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Attach a file
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            File uploads need a storage token. See docs/SETUP.md.
          </p>
        ))}
    </div>
  );
}
