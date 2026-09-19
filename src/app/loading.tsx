import { PrinterLoader } from "@/components/ui/printer-loader";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <PrinterLoader label="Printing page preview..." />
    </div>
  );
}
