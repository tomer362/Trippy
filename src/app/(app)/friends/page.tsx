import { FriendsPanel } from "@/components/social/friends-panel";
import { requireUser } from "@/lib/auth";
import { getFriendsData } from "@/server/queries/social";

export const metadata = { title: "Friends" };

export default async function FriendsPage() {
  const user = await requireUser();
  const data = await getFriendsData(user.id);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Friends</h1>
      <p className="mb-6 text-muted-foreground">
        Friends can see trips you share with friends, and their visits show up as suggestions while
        you plan.
      </p>
      <FriendsPanel data={data} />
    </main>
  );
}
