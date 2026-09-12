"use client";
import { Moon, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NotificationToggle } from "@/components/settings/notification-toggle";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Avatar, Switch } from "@/components/ui/misc";
import { signOut } from "@/lib/auth-client";
import { deleteAccount } from "@/server/actions/account";
import { deleteSavedTemplate } from "@/server/actions/content";
import { updateProfile } from "@/server/actions/social";

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "ILS",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "THB",
  "MXN",
  "INR",
  "BRL",
  "NZD",
  "SGD",
  "AED",
  "TRY",
];

export function SettingsForm({
  user,
  profile,
  templates,
  vapidPublicKey,
}: {
  user: { name: string; email: string; image: string | null };
  profile: {
    handle: string;
    bio: string | null;
    homeCurrency: string;
    isPublic: boolean;
    notifyInvites: boolean;
    notifyComments: boolean;
    notifyTripReminders: boolean;
  };
  templates: Array<{ id: string; name: string; count: number }>;
  vapidPublicKey: string | null;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [currency, setCurrency] = useState(profile.homeCurrency);
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [notify, setNotify] = useState({
    invites: profile.notifyInvites,
    comments: profile.notifyComments,
    reminders: profile.notifyTripReminders,
  });
  const [confirmText, setConfirmText] = useState("");
  const [pending, start] = useTransition();

  function save(patch: Parameters<typeof updateProfile>[0], success = "Saved") {
    start(async () => {
      const res = await updateProfile(patch);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="font-bold">Your profile</h2>
        <div className="flex items-center gap-3">
          <Avatar src={user.image} name={user.name} size={56} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="handle">Handle</Label>
          <Input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            maxLength={20}
          />
          <p className="text-xs text-muted-foreground">
            Your public profile lives at /u/{handle || "…"}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="Where you've been, what you look for."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="home-currency">Home currency</Label>
          <select
            id="home-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-11 w-full rounded-2xl border border-border bg-background px-3"
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
          <span>
            <span className="block font-semibold">Public profile</span>
            <span className="block text-sm text-muted-foreground">
              Let anyone see your published guides and countries visited.
            </span>
          </span>
          <Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="Public profile" />
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            save({ handle, bio: bio.trim() || null, homeCurrency: currency, isPublic })
          }
        >
          Save profile
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Notifications</h2>
        {(
          [
            ["invites", "Invites and new trip mates", "notifyInvites"],
            ["comments", "Comments and mentions", "notifyComments"],
            ["reminders", "Trip starting reminders", "notifyTripReminders"],
          ] as const
        ).map(([key, label, field]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
          >
            <span className="font-medium">{label}</span>
            <Switch
              checked={notify[key]}
              aria-label={label}
              onCheckedChange={(value) => {
                setNotify((prev) => ({ ...prev, [key]: value }));
                save({ [field]: value }, "Notification settings saved");
              }}
            />
          </div>
        ))}
        <NotificationToggle vapidPublicKey={vapidPublicKey} />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Appearance</h2>
        <Button
          variant="outline"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun /> : <Moon />} Switch to{" "}
          {resolvedTheme === "dark" ? "light" : "dark"} mode
        </Button>
      </section>

      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Saved checklist templates</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.count} items</span>
                <button
                  type="button"
                  aria-label={`Delete ${t.name}`}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  onClick={() =>
                    start(async () => {
                      await deleteSavedTemplate({ id: t.id });
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-3xl border border-destructive/30 p-4">
        <h2 className="font-bold text-destructive">Delete your account</h2>
        <p className="text-sm text-muted-foreground">
          This removes your trips, places, expenses, photos and memberships. Trips you own with
          other editors are handed to the longest-standing editor so their work survives. This
          cannot be undone.
        </p>
        <div className="space-y-1">
          <Label htmlFor="confirm-handle">Type your handle to confirm</Label>
          <Input
            id="confirm-handle"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={profile.handle}
          />
        </div>
        <Button
          variant="destructive"
          disabled={pending || confirmText !== profile.handle}
          onClick={() =>
            start(async () => {
              const res = await deleteAccount({ handle: confirmText });
              if (!res.ok) toast.error(res.error);
              else {
                await signOut();
                router.push("/");
              }
            })
          }
        >
          Delete my account
        </Button>
      </section>
    </div>
  );
}
