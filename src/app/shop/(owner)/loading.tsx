import { PrinterLoader } from "@/components/ui/printer-loader";

export default function ShopOwnerLoading() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center rounded-3xl border border-line/60 bg-white/60 p-12 backdrop-blur-sm">
      <PrinterLoader label="Loading shop data..." />
    </div>
  );
}
