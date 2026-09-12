import { NewTripWizard } from "@/components/trips/new-trip-wizard";

export const metadata = { title: "New trip" };

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const initialKind = kind === "plan" || kind === "guide" || kind === "journal" ? kind : undefined;
  return <NewTripWizard initialKind={initialKind} />;
}
