import { expenseCorrectionPreview } from "@/features/keuangan/helpers/expense-correction-input";
import { requireExpenseCorrectionAccess } from "@/features/keuangan/services/expense-correction-access";
import { previewExpenseCorrection } from "@/features/keuangan/services/expense-correction-service";
import { badCorrectionInput, expenseCorrectionError } from "../route-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = expenseCorrectionPreview.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badCorrectionInput();
    const actor = await requireExpenseCorrectionAccess(parsed.data.subject, parsed.data.operation);
    return Response.json({ data: await previewExpenseCorrection(parsed.data, actor) });
  } catch (error) {
    return expenseCorrectionError(error);
  }
}
