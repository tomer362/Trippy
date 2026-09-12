"use client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { TooltipProvider } from "@/components/ui/misc";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            // A day's worth of cache is what makes an opened trip readable offline.
            gcTime: 24 * 60 * 60 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );
  // Persisting the cache is what lets a trip you opened earlier still render with no network.
  const [persister] = useState(() =>
    typeof window === "undefined"
      ? null
      : createSyncStoragePersister({
          storage: window.localStorage,
          key: "trippy:queries",
          throttleTime: 2000,
        }),
  );

  const tree = (
    <>
      <OfflineBanner />
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster position="top-center" richColors closeButton />
      <RegisterServiceWorker />
      <InstallPrompt />
    </>
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {persister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          {tree}
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
      )}
    </ThemeProvider>
  );
}
