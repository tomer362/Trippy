import { Compass, Map as MapIcon, Users, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const highlights = [
  {
    icon: MapIcon,
    title: "Places on a map",
    text: "Search any spot, save it to lists, and see everything on one map.",
  },
  {
    icon: Compass,
    title: "Day-by-day itinerary",
    text: "Drag stops into days and see driving, walking or transit time between them.",
  },
  {
    icon: Users,
    title: "Plan together",
    text: "Invite trip mates with a link. Everyone edits the same plan, live.",
  },
  {
    icon: Wallet,
    title: "Hotels & budget",
    text: "Track where you sleep each night and who paid for what.",
  },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession().catch(() => null);
  const { next } = await searchParams;
  if (session) redirect(next?.startsWith("/") ? next : "/trips");

  return (
    <main className="sunset-bg flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight">{APP_NAME}</span>
        </header>
        <section className="flex flex-1 flex-col justify-center gap-8 py-12 md:flex-row md:items-center md:gap-16">
          <div className="flex-1 space-y-6">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
              {APP_TAGLINE.split(". ").map((line, i) => (
                <span key={i} className="block">
                  {line.replace(/\.$/, "")}.
                </span>
              ))}
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              A collaborative trip planner with maps, itineraries, hotels, bookings, budgets and a
              travel journal. Free to use.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <GoogleSignInButton next={next} enabled={features.googleAuth} />
            </div>
            {!features.googleAuth && (
              <p className="text-sm text-muted-foreground">
                Google sign-in isn't configured yet. See <code>docs/SETUP.md</code>.
              </p>
            )}
          </div>
          <ul className="grid flex-1 gap-3 sm:grid-cols-2">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="rounded-3xl border border-white/60 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <Icon className="mb-3 size-6 text-primary" />
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>
        <footer className="text-xs text-muted-foreground">
          Map data © Google. Destination photos from Wikimedia Commons contributors.
        </footer>
      </div>
    </main>
  );
}
