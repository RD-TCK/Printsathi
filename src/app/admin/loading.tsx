import { PrinterLoader } from "@/components/ui/printer-loader";

export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center p-12">
      <PrinterLoader label="Loading admin analytics..." />
    </div>
  );
}
