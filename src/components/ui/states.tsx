import { LoaderCircle, Inbox, TriangleAlert } from "lucide-react";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-sm text-muted" role="status">
      <LoaderCircle className="size-5 animate-spin text-brand-600" />
      {label}
    </div>
  );
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-white p-6 text-center">
      <Inbox className="size-7 text-brand-600" />
      <h2 className="font-semibold text-brand-950">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}
export function ErrorState({
  title = "Something went wrong",
  description = "Please try again shortly.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-900">
      <TriangleAlert className="size-7" />
      <h2 className="font-semibold">{title}</h2>
      <p className="max-w-sm text-sm">{description}</p>
    </div>
  );
}
