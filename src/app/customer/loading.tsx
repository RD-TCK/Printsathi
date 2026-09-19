import { PrinterLoader } from "@/components/ui/printer-loader";

export default function CustomerLoading() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center p-12">
      <PrinterLoader label="Loading customer portal..." />
    </div>
  );
}
