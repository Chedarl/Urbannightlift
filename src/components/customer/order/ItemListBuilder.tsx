"use client";

import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { OrderInput } from "@/lib/validation/orderSchema";
import { cn } from "@/lib/utils";

const cellCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none focus:ring-2";

export interface BuilderColumn {
  /** sub-key under the row object, e.g. "name" | "qty" | "notes" */
  key: string;
  placeholder: string;
  type?: "text" | "number";
  /** flex grow weight (default 1) */
  grow?: number;
  min?: number;
}

/**
 * Reusable repeatable-row builder (food dishes, medicines, grocery items…).
 * Rows live under `serviceDetails.<name>` in the shared react-hook-form state.
 */
export function ItemListBuilder({
  control,
  register,
  name,
  columns,
  addLabel,
  accent,
  emptyRow,
}: {
  control: Control<OrderInput>;
  register: UseFormRegister<OrderInput>;
  /** field-array path, e.g. "serviceDetails.foodItems" */
  name: `serviceDetails.${string}`;
  columns: BuilderColumn[];
  addLabel: string;
  accent: string;
  emptyRow: Record<string, string | number>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    // react-hook-form types field-array names against the schema; serviceDetails
    // is a loose record, so this dynamic path is cast through unknown.
    name: name as never,
  });

  const focusRing = { "--tw-ring-color": `${accent}66` } as React.CSSProperties;

  return (
    <div className="flex flex-col gap-2">
      {fields.map((field, i) => (
        <div key={field.id} className="flex items-start gap-2">
          {columns.map((col) => (
            <input
              key={col.key}
              className={cn(cellCls)}
              style={{ ...focusRing, flexGrow: col.grow ?? 1, flexBasis: 0, minWidth: 0 }}
              type={col.type ?? "text"}
              min={col.min}
              inputMode={col.type === "number" ? "numeric" : undefined}
              placeholder={col.placeholder}
              {...register(`${name}.${i}.${col.key}` as never)}
            />
          ))}
          <button
            type="button"
            onClick={() => remove(i)}
            className="mt-1 shrink-0 rounded-lg border border-ink-700 bg-ink-800 p-2 text-mist-500 hover:text-restricted"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => append(emptyRow as never)}
        className="flex items-center gap-1.5 self-start rounded-xl border border-dashed px-3 py-2 text-xs font-medium"
        style={{ borderColor: `${accent}66`, color: accent }}
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}
