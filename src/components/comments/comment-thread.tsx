"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { addComment, removeComment, toggleReaction } from "@/server/actions/comments";

export type CommentEntityType =
  | "trip_place"
  | "itinerary_day"
  | "itinerary_item"
  | "lodging"
  | "reservation"
  | "journal_entry"
  | "trip";

type ThreadData = {
  viewerId: string | null;
  canComment: boolean;
  comments: Array<{
    id: string;
    body: string;
    userId: string;
    authorName: string;
    authorImage: string | null;
    createdAt: string;
  }>;
  reactions: Array<{ emoji: string; userId: string; userName: string }>;
};

const QUICK_REACTIONS = ["👍", "❤️", "🤔", "🙌"];

function relative(iso: string) {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Comments and emoji reactions on one thing: a place, a day, a booking. Viewers can post. */
export function CommentThread({
  tripId,
  entityType,
  entityId,
  compact,
}: {
  tripId: string;
  entityType: CommentEntityType;
  entityId: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["comments", tripId, entityType, entityId];
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<ThreadData> => {
      const res = await fetch(
        `/api/trips/${tripId}/comments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
      );
      if (!res.ok) throw new Error("Could not load comments");
      return (await res.json()) as ThreadData;
    },
    staleTime: 15_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  function post() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await addComment({ tripId, entityType, entityId, body: text });
      if (!res.ok) toast.error(res.error);
      else {
        setBody("");
        invalidate();
      }
    });
  }

  const counts = new Map<string, { count: number; mine: boolean; who: string[] }>();
  for (const r of data?.reactions ?? []) {
    const entry = counts.get(r.emoji) ?? { count: 0, mine: false, who: [] };
    entry.count += 1;
    entry.who.push(r.userName);
    if (r.userId === data?.viewerId) entry.mine = true;
    counts.set(r.emoji, entry);
  }

  return (
    <div className={cn("space-y-2", compact && "text-sm")}>
      <div className="flex flex-wrap gap-1">
        {QUICK_REACTIONS.map((emoji) => {
          const entry = counts.get(emoji);
          return (
            <button
              key={emoji}
              type="button"
              title={entry?.who.join(", ")}
              onClick={() =>
                start(async () => {
                  const res = await toggleReaction({ tripId, entityType, entityId, emoji });
                  if (!res.ok) toast.error(res.error);
                  else invalidate();
                })
              }
              className={cn(
                "rounded-full border px-2 py-0.5 text-sm",
                entry?.mine ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
              )}
            >
              {emoji}
              {entry?.count ? (
                <span className="ml-1 text-xs font-semibold">{entry.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Spinner className="size-4" />
      ) : (
        (data?.comments.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {data!.comments.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <Avatar src={c.authorImage} name={c.authorName} size={24} />
                <span className="min-w-0 flex-1 rounded-2xl bg-muted px-3 py-2">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-xs font-semibold">{c.authorName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {relative(c.createdAt)}
                    </span>
                    {c.userId === data!.viewerId && (
                      <button
                        type="button"
                        aria-label="Delete comment"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          start(async () => {
                            const res = await removeComment({ tripId, id: c.id });
                            if (!res.ok) toast.error(res.error);
                            else invalidate();
                          })
                        }
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                  <span className="block whitespace-pre-wrap break-words">{c.body}</span>
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      {data?.canComment && (
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
            }}
            rows={1}
            placeholder="Add a comment"
            aria-label="Add a comment"
            className="min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="icon"
            disabled={pending || !body.trim()}
            onClick={post}
            aria-label="Post comment"
          >
            {pending ? <Spinner className="size-4" /> : <Send />}
          </Button>
        </div>
      )}
    </div>
  );
}
