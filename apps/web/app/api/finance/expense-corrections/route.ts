import {
  expenseCorrectionConfirmation,
  expenseCorrectionOperation,
  expenseCorrectionSubject,
} from "@/features/keuangan/helpers/expense-correction-input";
import { requireExpenseCorrectionAccess } from "@/features/keuangan/services/expense-correction-access";
import { commitExpenseCorrection, loadExpenseCorrectionEditor } from "@/features/keuangan/services/expense-correction-service";
import { badCorrectionInput, expenseCorrectionError } from "./route-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const operation = expenseCorrectionOperation.safeParse(params.get("operation"));
    const paymentKind = params.get("paymentKind");
    const paymentId = params.get("paymentId");
    const subject = expenseCorrectionSubject.safeParse({
      type: params.get("type"), id: params.get("id"),
      ...(paymentKind !== null || paymentId !== null ? { payment: { kind: paymentKind, id: paymentId } } : {}),
    });
    if (!operation.success || !subject.success) return badCorrectionInput();
    const actor = await requireExpenseCorrectionAccess(subject.data, operation.data);
    const data = await loadExpenseCorrectionEditor(subject.data, operation.data, actor);
    return Response.json({ data });
  } catch (error) {
    return expenseCorrectionError(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = expenseCorrectionConfirmation.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badCorrectionInput();
    const actor = await requireExpenseCorrectionAccess(parsed.data.subject, parsed.data.operation);
    return Response.json({ data: await commitExpenseCorrection(parsed.data, actor) });
  } catch (error) {
    return expenseCorrectionError(error);
  }
}
