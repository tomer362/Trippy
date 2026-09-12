"use client";
import { Copy, Link2, Mail, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { createInvite, revokeInvite } from "@/server/actions/members";
import type { InviteDTO } from "@/server/queries/social";

/** Creates a role-scoped invite link, shared through the system share sheet or by email. */
export function InviteSheet({
  open,
  onOpenChange,
  tripId,
  tripName,
  invites,
  emailEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
  invites: InviteDTO[];
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  function create() {
    start(async () => {
      const res = await createInvite({
        tripId,
        role,
        email: email.trim() || undefined,
        expiresInDays: 30,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLastUrl(res.data.url);
      setEmail("");
      toast.success(res.data.emailed ? "Invite sent" : "Invite link ready");
      router.refresh();
      await share(res.data.url);
    });
  }

  async function share(url: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${tripName}`, url });
        return;
      } catch {
        // user dismissed the share sheet; fall through to the clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      // clipboard blocked: the link stays visible for manual copying
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle className="mb-1 text-lg font-bold">Invite trip mates</DialogTitle>
        <p className="mb-4 text-sm text-muted-foreground">
          Anyone with the link can join. They don't need an account until they open it.
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="invite-role">They can</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3"
            >
              <option value="editor">Edit everything</option>
              <option value="viewer">View and comment</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email (optional)</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              disabled={!emailEnabled}
            />
            {!emailEnabled && (
              <p className="text-xs text-muted-foreground">
                Email sending isn't configured, so share the link instead.
              </p>
            )}
          </div>
          <Button className="w-full" disabled={pending} onClick={create}>
            {pending ? <Spinner /> : email.trim() ? <Mail /> : <Share2 />}
            {email.trim() ? "Send invite" : "Create invite link"}
          </Button>

          {lastUrl && (
            <div className="flex items-center gap-2 rounded-2xl bg-muted p-2">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">{lastUrl}</span>
              <button
                type="button"
                onClick={() => void share(lastUrl)}
                className="rounded-lg p-1.5 hover:bg-background"
                aria-label="Copy invite link"
              >
                <Copy className="size-4" />
              </button>
            </div>
          )}

          {invites.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              <p className="text-xs font-bold uppercase text-muted-foreground">Active links</p>
              <ul className="space-y-1">
                {invites.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium capitalize">{i.role}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.email ?? "Anyone with the link"}
                        {i.uses > 0 && ` · used ${i.uses}×`}
                        {i.expiresAt && ` · expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void share(`${window.location.origin}/invite/${i.token}`)}
                      className="rounded-lg p-1.5 hover:bg-muted"
                      aria-label="Share this invite"
                    >
                      <Share2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        start(async () => {
                          const res = await revokeInvite({ tripId, id: i.id });
                          if (!res.ok) toast.error(res.error);
                          else router.refresh();
                        })
                      }
                      className="rounded-lg p-1.5 text-destructive hover:bg-muted"
                      aria-label="Revoke this invite"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}
