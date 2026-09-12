import { eq } from "drizzle-orm";
import { SettingsForm } from "@/components/settings/settings-form";
import { env } from "@/env";
import { requireUser } from "@/lib/auth";
import { db } from "@/server/db";
import { userProfile } from "@/server/db/schema";
import { getSavedTemplates } from "@/server/queries/content";
import { ensureProfile } from "@/server/services/profile";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [existing] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, user.id))
    .limit(1);
  const profile = existing ?? (await ensureProfile(user.id, user.name, user.email));
  const templates = await getSavedTemplates(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Settings</h1>
      <SettingsForm
        user={{ name: user.name, email: user.email, image: user.image ?? null }}
        profile={{
          handle: profile.handle,
          bio: profile.bio,
          homeCurrency: profile.homeCurrency,
          isPublic: profile.isPublic,
          notifyInvites: profile.notifyInvites,
          notifyComments: profile.notifyComments,
          notifyTripReminders: profile.notifyTripReminders,
        }}
        templates={templates.map((t) => ({ id: t.id, name: t.name, count: t.items.length }))}
        vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      />
    </main>
  );
}
