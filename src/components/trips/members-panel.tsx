"use client";
import { Crown, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { removeMember, setMemberRole, transferOwnership } from "@/server/actions/members";
import type { InviteDTO } from "@/server/queries/social";
import type { TripMemberInfo } from "@/server/queries/trips";
import { InviteSheet } from "./invite-sheet";

export function MembersPanel({
  tripId,
  tripName,
  members,
  invites,
  canManage,
  canEdit,
  currentUserId,
  emailEnabled,
}: {
  tripId: string;
  tripName: string;
  members: TripMemberInfo[];
  invites: InviteDTO[];
  canManage: boolean;
  canEdit: boolean;
  currentUserId: string;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Failed");
      else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  return (
    <section id="members" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Trip mates</h3>
        {canEdit && (
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus /> Invite
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
            <Avatar src={m.image} name={m.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate font-semibold">
                {m.name}
                {m.role === "owner" && <Crown className="size-3.5 text-amber-500" />}
                {m.userId === currentUserId && (
                  <span className="text-xs font-normal text-muted-foreground">(you)</span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
            </span>
            {canManage && m.userId !== currentUserId ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize hover:bg-muted/70"
                  disabled={pending}
                >
                  {m.role}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      run(
                        () => setMemberRole({ tripId, memberId: m.userId, role: "editor" }),
                        "Now an editor",
                      )
                    }
                  >
                    Can edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      run(
                        () => setMemberRole({ tripId, memberId: m.userId, role: "viewer" }),
                        "Now a viewer",
                      )
                    }
                  >
                    Can view and comment
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      if (
                        confirm(`Make ${m.name} the owner of this trip? You stay on as an editor.`)
                      ) {
                        run(
                          () => transferOwnership({ tripId, memberId: m.userId }),
                          "Ownership transferred",
                        );
                      }
                    }}
                  >
                    Make owner
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    onSelect={() => {
                      if (confirm(`Remove ${m.name} from this trip?`))
                        run(() => removeMember({ tripId, memberId: m.userId }), "Removed");
                    }}
                  >
                    Remove from trip
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
                {m.role}
              </span>
            )}
          </li>
        ))}
      </ul>
      <InviteSheet
        open={inviting}
        onOpenChange={setInviting}
        tripId={tripId}
        tripName={tripName}
        invites={invites}
        emailEnabled={emailEnabled}
      />
    </section>
  );
}
