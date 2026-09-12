"use client";
import { LogOut, Moon, Settings, Sun, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { signOut } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/constants";

export function AppNav({ user }: { user: { name: string; image: string | null; email: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // The trip workspace has its own chrome.
  if (pathname.startsWith("/t/")) return null;
  return (
    <header className="no-print sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur safe-pt">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/trips" className="text-lg font-extrabold tracking-tight">
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <Link href="/trips" className="rounded-full px-3 py-1.5 hover:bg-muted">
            Trips
          </Link>
          <Link href="/explore" className="rounded-full px-3 py-1.5 hover:bg-muted">
            Explore
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar src={user.image} name={user.name} size={34} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <span className="block truncate text-foreground">{user.name}</span>
                <span className="block truncate font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/friends")}>
                <Users /> Friends
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}{" "}
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  await signOut();
                  router.push("/");
                  router.refresh();
                }}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
