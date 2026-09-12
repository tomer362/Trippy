import { AppNav } from "@/components/layout/app-nav";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav user={{ name: user.name, image: user.image ?? null, email: user.email }} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
