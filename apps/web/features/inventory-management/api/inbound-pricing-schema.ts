import { z } from "zod";

const optionalPrice = z.number().min(0).max(9_999_999_999.99).nullable().optional().default(null);

export const inboundPricingBaselineSchema = z.object({
  unit: z.string(),
  unitMultiplierToBase: z.number().positive(),
  costPrice: z.number().nullable(),
  price: z.number(),
  hargaAgen: z.number().nullable(),
  hargaDinas: z.number().nullable(),
  pricingMode: z.enum(["AUTO", "MANUAL"]),
  pricingSourceProductId: z.string().nullable(),
  pricingConfigRevision: z.number().int().nullable(),
}).strict();

export const inboundPricingSchema = z.object({
  productId: z.string().trim().min(1).nullable().optional().default(null),
  costPrice: optionalPrice,
  price: optionalPrice,
  hargaAgen: optionalPrice,
  hargaDinas: optionalPrice,
}).strict();
