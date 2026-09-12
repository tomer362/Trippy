"use client";
import { Link2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import type { PlaceCandidate } from "@/lib/extract-places";
import { importPlaces } from "@/server/actions/import";

const SOURCE_LABEL: Record<PlaceCandidate["source"], string> = {
  "google-maps-url": "map link",
  heading: "heading",
  list: "list item",
  link: "link",
  text: "pasted",
};

/**
 * Import from a link or a pasted list. Everything found is shown for review first, because
 * reading places out of a web page is a guess, not a fact.
 */
export function ImportSheet({
  open,
  onOpenChange,
  tripId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [listName, setListName] = useState("Imported");
  const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [pending, start] = useTransition();

  async function read(payload: { url?: string; text?: string }) {
    setReading(true);
    try {
      const res = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        candidates?: PlaceCandidate[];
        error?: string;
        title?: string | null;
      };
      if (data.error && (data.candidates ?? []).length === 0) {
        toast.error(data.error);
        return;
      }
      const found = data.candidates ?? [];
      setCandidates(found);
      setSelected(
        new Set(
          found
            .filter((c) => c.source === "google-maps-url" || c.source === "list")
            .map((c) => c.name),
        ),
      );
      if (data.title) setListName(data.title.slice(0, 60));
      if (found.length === 0)
        toast.info("Nothing recognisable on that page. Try pasting the names instead.");
    } catch {
      toast.error("Couldn't read that");
    } finally {
      setReading(false);
    }
  }

  function save() {
    const items = (candidates ?? [])
      .filter((c) => selected.has(c.name))
      .map((c) => ({ name: c.name, lat: c.lat, lng: c.lng }));
    if (items.length === 0) return;
    start(async () => {
      const res = await importPlaces({ tripId, listName: listName.trim() || "Imported", items });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.added === 0) {
        toast.error(
          res.data.mapsConfigured
            ? "None of those could be matched to a place"
            : "Place lookup needs a Maps server key",
        );
        return;
      }
      toast.success(
        res.data.unmatched.length > 0
          ? `Added ${res.data.added}. Couldn't match: ${res.data.unmatched.slice(0, 3).join(", ")}`
          : `Added ${res.data.added} places`,
      );
      onOpenChange(false);
      setCandidates(null);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="mb-1 text-lg font-bold">Import places</DialogTitle>
        <p className="mb-4 text-sm text-muted-foreground">
          Paste a Google Maps link, a saved-list link, or an article. We'll show what we find so you
          can pick.
        </p>

        {candidates === null ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="import-url">Link</Label>
              <div className="flex gap-2">
                <Input
                  id="import-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                />
                <Button
                  disabled={reading || !url.trim()}
                  onClick={() => void read({ url: url.trim() })}
                >
                  {reading ? <Loader2 className="animate-spin" /> : <Link2 />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-text">Or paste a list, one place per line</Label>
              <Textarea
                id="import-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={"Tsukiji Outer Market\nSenso-ji\nShibuya Sky"}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={reading || !text.trim()}
                onClick={() => void read({ text })}
              >
                {reading ? <Spinner /> : <Upload />} Read this list
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="import-list-name">Save into a list called</Label>
              <Input
                id="import-list-name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selected.size} of {candidates.length} selected
              </span>
              <button
                type="button"
                className="font-semibold hover:underline"
                onClick={() =>
                  setSelected(
                    selected.size === candidates.length
                      ? new Set()
                      : new Set(candidates.map((c) => c.name)),
                  )
                }
              >
                {selected.size === candidates.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-border p-2">
              {candidates.map((c) => (
                <li key={c.name}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(c.name)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.name);
                          else next.delete(c.name);
                          return next;
                        })
                      }
                      className="size-4"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                      {SOURCE_LABEL[c.source]}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCandidates(null)}>
                Back
              </Button>
              <Button className="flex-1" disabled={pending || selected.size === 0} onClick={save}>
                {pending ? (
                  <Spinner />
                ) : (
                  `Add ${selected.size} place${selected.size === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}
