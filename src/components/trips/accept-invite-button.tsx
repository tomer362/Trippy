"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { acceptInvite } from "@/server/actions/members";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptInvite({ token });
          if (!res.ok) toast.error(res.error);
          else router.push(`/t/${res.data.tripId}`);
        })
      }
    >
      {pending ? <Spinner /> : "Join this trip"}
    </Button>
  );
}
