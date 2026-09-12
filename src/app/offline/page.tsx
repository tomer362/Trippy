import { WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="sunset-bg flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-2xl font-bold">You're offline</h1>
      <p className="max-w-sm text-muted-foreground">
        Trips you've opened recently are still available. Reconnect to sync new changes.
      </p>
      <Button asChild variant="outline">
        <Link href="/trips">Open my trips</Link>
      </Button>
    </main>
  );
}
