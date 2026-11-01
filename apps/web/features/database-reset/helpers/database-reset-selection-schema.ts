import { z } from "zod";
import { DATABASE_RESET_OPTIONS, DATABASE_RESET_SELECTABLE_MODELS } from "./database-reset-options";

export const databaseResetSelectionSchema = z.object({
  domains: z.array(z.enum(DATABASE_RESET_OPTIONS.map(option => option.id))).min(1).optional(),
  models: z.array(z.enum(DATABASE_RESET_SELECTABLE_MODELS)).min(1).optional(),
}).refine(selection => (selection.domains === undefined) !== (selection.models === undefined), {
  message: "Pilih kategori atau sub-data, bukan keduanya.",
});
