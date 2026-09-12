"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { signIn } from "@/lib/auth-client";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12S6.6 21.7 12 21.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ next, enabled }: { next?: string; enabled: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="lg"
      className="bg-foreground text-background hover:bg-foreground/90"
      disabled={!enabled || loading}
      onClick={async () => {
        setLoading(true);
        const res = await signIn.social({
          provider: "google",
          callbackURL: next?.startsWith("/") ? next : "/trips",
        });
        if (res.error) {
          toast.error(res.error.message ?? "Sign-in failed");
          setLoading(false);
        }
      }}
    >
      {loading ? <Spinner /> : <GoogleGlyph />}
      Continue with Google
    </Button>
  );
}
