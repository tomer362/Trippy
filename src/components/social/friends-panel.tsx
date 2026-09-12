"use client";
import { Check, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Avatar, EmptyState, Spinner } from "@/components/ui/misc";
import { removeFriend, requestFriend, respondToFriendRequest } from "@/server/actions/social";
import type { FriendsData, PersonDTO } from "@/server/queries/social";

export function FriendsPanel({ data }: { data: FriendsData }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const res = await requestFriend({ query });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data.accepted
          ? `You and ${res.data.name} are now friends`
          : `Request sent to ${res.data.name}`,
      );
      setQuery("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <Label htmlFor="friend-query">Add a friend</Label>
        <div className="flex gap-2">
          <Input
            id="friend-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@handle or email"
            onKeyDown={(e) => e.key === "Enter" && query.trim() && add()}
          />
          <Button disabled={pending || !query.trim()} onClick={add}>
            {pending ? <Spinner /> : <UserPlus />}
          </Button>
        </div>
      </section>

      {data.incoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Requests for you</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {data.incoming.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                <Person person={p} />
                <span className="ml-auto flex gap-1">
                  <Button
                    size="icon-sm"
                    aria-label={`Accept ${p.name}`}
                    onClick={() =>
                      start(async () => {
                        await respondToFriendRequest({ requesterId: p.userId, accept: true });
                        router.refresh();
                      })
                    }
                  >
                    <Check />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Decline ${p.name}`}
                    onClick={() =>
                      start(async () => {
                        await respondToFriendRequest({ requesterId: p.userId, accept: false });
                        router.refresh();
                      })
                    }
                  >
                    <X />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Your friends</h2>
        {data.friends.length === 0 ? (
          <EmptyState
            title="No friends yet"
            description="Add someone by their handle or the email they signed up with."
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {data.friends.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                <Person person={p} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  onClick={() => {
                    if (!confirm(`Remove ${p.name} as a friend?`)) return;
                    start(async () => {
                      await removeFriend({ otherId: p.userId });
                      router.refresh();
                    });
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Requests you sent</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {data.outgoing.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                <Person person={p} />
                <span className="ml-auto text-xs text-muted-foreground">Pending</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Person({ person }: { person: PersonDTO }) {
  return (
    <>
      <Avatar src={person.image} name={person.name} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{person.name}</span>
        {person.handle && (
          <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span>
        )}
      </span>
    </>
  );
}
