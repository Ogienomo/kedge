"use client";

import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { cn } from "@kedge/ui";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  caption: string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
  footer?: ReactNode;
}

/**
 * Data grid on TanStack Table. Dense tables scroll horizontally inside their
 * container, never the page (SPEC §12). Rows are keyboard-reachable links.
 */
export function DataTable<T>({ data, columns, caption, onRowClick, rowHref, empty, footer }: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack Table returns non-memoisable functions; the React Compiler lint knows this.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  if (data.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border bg-subtle/60">
              {hg.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const align = (header.column.columnDef.meta as { align?: "right" } | undefined)?.align;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={cn("px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted", align === "right" && "text-right")}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse")}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? <ArrowUp aria-hidden className="size-3" /> : sorted === "desc" ? <ArrowDown aria-hidden className="size-3" /> : null}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const href = rowHref?.(row.original);
            const clickable = Boolean(href || onRowClick);
            const open = () => (href ? router.push(href) : onRowClick?.(row.original));
            return (
              <tr
                key={row.id}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? open : undefined}
                onKeyDown={clickable ? (e) => e.key === "Enter" && open() : undefined}
                className={cn("border-b border-border last:border-0", clickable && "cursor-pointer hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none")}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef.meta as { align?: "right" } | undefined)?.align;
                  return (
                    <td key={cell.id} className={cn("px-3 py-2.5 align-middle", align === "right" && "text-right")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}
