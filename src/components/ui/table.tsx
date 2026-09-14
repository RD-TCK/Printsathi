import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
          <tr>
            {headers.map((header) => (
              <th className="px-5 py-3 font-semibold" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn("divide-y divide-line")}>
          {rows.map((row, rowIndex) => (
            <tr className="hover:bg-brand-50/50" key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td className="px-5 py-4" key={cellIndex}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
