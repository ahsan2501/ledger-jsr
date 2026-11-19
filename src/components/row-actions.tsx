import { InlineAction } from "./forms";
import { deleteRow } from "@/app/actions/finance";

export function DeleteButton({ table, id, label = "Delete", what = "this record" }: { table: string; id: string; label?: string; what?: string }) {
  return (
    <InlineAction action={deleteRow} fields={{ table, id }} label={label} confirm={`Delete ${what}? This can't be undone.`}
      className="text-xs text-danger underline-offset-2 hover:underline" />
  );
}
