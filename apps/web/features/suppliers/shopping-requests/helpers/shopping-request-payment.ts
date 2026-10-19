import { z } from "zod";

export const shoppingRequestPaymentSchema = z.object({
  paymentMethod: z.enum(["TRANSFER", "GIRO"], { message: "Pilih metode pembayaran Transfer atau Giro." }).default("TRANSFER"),
  paymentDueDate: z.string().nullish(),
}).superRefine((payment, context) => {
  if (payment.paymentMethod === "GIRO" && !z.iso.date().safeParse(payment.paymentDueDate).success) {
    context.addIssue({ code: "custom", path: ["paymentDueDate"], message: "Isi tanggal jatuh tempo giro dengan tanggal yang valid." });
  }
}).transform((payment) => ({
  paymentMethod: payment.paymentMethod,
  paymentDueDate: payment.paymentMethod === "GIRO" ? payment.paymentDueDate ?? null : null,
}));

export type ShoppingRequestPaymentInput = z.input<typeof shoppingRequestPaymentSchema>;
export type ShoppingRequestPaymentMethod = z.output<typeof shoppingRequestPaymentSchema>["paymentMethod"];
