import { z } from "zod";

const optionalPrice = z.number().min(0).max(9_999_999_999.99).nullable().optional().default(null);

export const inboundPricingSchema = z.object({
  productId: z.string().trim().min(1).nullable().optional().default(null),
  costPrice: optionalPrice,
  price: optionalPrice,
  hargaAgen: optionalPrice,
  hargaDinas: optionalPrice,
}).strict();
