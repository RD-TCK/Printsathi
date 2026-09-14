import { LoadingState } from "@/components/ui/states";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-6">
      <LoadingState label="Loading shop" />
    </main>
  );
}
