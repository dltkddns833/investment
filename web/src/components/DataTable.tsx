"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
}

export default function DataTable<T>({ columns, data }: Props<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr
              key={hg.id}
              className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider"
            >
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className={`py-2.5 px-3 md:py-3 md:px-4 ${header.column.columnDef.meta?.className ?? "text-left"}`}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-white/5 table-row-hover"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`py-2.5 px-3 md:py-3 md:px-4 ${cell.column.columnDef.meta?.className ?? ""}`}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
