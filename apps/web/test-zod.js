import { z } from "zod";

console.warn(z.coerce.number().optional().nullable().parse(null));
console.warn(z.coerce.number().optional().nullable().parse(undefined));
console.warn(z.coerce.number().optional().nullable().parse(""));
