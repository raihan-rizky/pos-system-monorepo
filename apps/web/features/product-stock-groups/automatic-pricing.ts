export type ExactDecimal = string | number;
export type PricingMode = "AUTO" | "MANUAL";
export type ExactRatio = { numerator: string; denominator: string };
export type PricingReviewReason =
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_AMBIGUOUS"
  | "CONVERSION_INVALID"
  | "SOURCE_PRICE_ZERO"
  | "SOURCE_COST_UNKNOWN";
export type PricingReview = { price: PricingReviewReason[]; costPrice: PricingReviewReason[] };
export type GroupPricingMemberConfig = {
  mode: PricingMode;
  factor: ExactRatio | null;
  review: PricingReview;
};
export type GroupPricingConfig = {
  sourceProductId: string | null;
  revision: number;
  initializationVersion: 1;
  members: Record<string, GroupPricingMemberConfig>;
};
export type GroupPricingMember = {
  id: string;
  storeId: string;
  groupId: string;
  unit: string;
  price: ExactDecimal;
  costPrice: ExactDecimal | null;
  unitMultiplierToBase: ExactDecimal;
  isActive: boolean;
  conversionNeedsReview: boolean;
};
export type GroupPricingInput = {
  groupId: string;
  storeId: string;
  baseUnit: string;
  members: GroupPricingMember[];
  config?: GroupPricingConfig | null;
};
export type GroupPricingMemberProjection = {
  productId: string;
  price: string;
  costPrice: string | null;
  review: PricingReview;
};
export type GroupPricingProjection = {
  config: GroupPricingConfig;
  members: GroupPricingMemberProjection[];
  initialized: boolean;
};

const MAX_MONEY_CENTS = BigInt("999999999999");
const ONE: ExactRatio = { numerator: "1", denominator: "1" };
const emptyReview = (): PricingReview => ({ price: [], costPrice: [] });

export function exactRatio(numerator: string, denominator: string): ExactRatio {
  if (!/^\d+$/.test(numerator) || !/^\d+$/.test(denominator)) {
    throw new Error("Rasio harus memakai bilangan bulat nonnegatif.");
  }
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === BigInt(0)) throw new Error("Penyebut rasio harus lebih dari nol.");
  let a = n;
  let b = d;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  n /= a;
  d /= a;
  return { numerator: n.toString(), denominator: d.toString() };
}

export function decimalToRatio(value: ExactDecimal): ExactRatio {
  const text = String(value);
  if (text.length > 1000) throw new Error("Angka terlalu panjang.");
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("Angka harus valid dan nonnegatif.");
  const exponent = Number(match[3] ?? 0) - (match[2]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) {
    throw new Error("Presisi angka melampaui batas.");
  }
  const digits = BigInt(match[1] + (match[2] ?? ""));
  const scale = BigInt(10) ** BigInt(Math.abs(exponent));
  return exponent >= 0
    ? exactRatio((digits * scale).toString(), "1")
    : exactRatio(digits.toString(), scale.toString());
}

export function multiplyRatios(...values: ExactRatio[]): ExactRatio {
  let n = BigInt(1);
  let d = BigInt(1);
  for (const value of values) {
    const ratio = exactRatio(value.numerator, value.denominator);
    n *= BigInt(ratio.numerator);
    d *= BigInt(ratio.denominator);
  }
  return exactRatio(n.toString(), d.toString());
}

export function divideRatios(left: ExactRatio, right: ExactRatio): ExactRatio {
  const divisor = exactRatio(right.numerator, right.denominator);
  if (divisor.numerator === "0") throw new Error("Pembagi harus lebih dari nol.");
  return multiplyRatios(left, { numerator: divisor.denominator, denominator: divisor.numerator });
}

export function roundMoney(value: ExactRatio): string {
  const ratio = exactRatio(value.numerator, value.denominator);
  const n = BigInt(ratio.numerator) * BigInt(100);
  const d = BigInt(ratio.denominator);
  const cents = n / d + (n % d * BigInt(2) >= d ? BigInt(1) : BigInt(0));
  if (cents > MAX_MONEY_CENTS) throw new Error("Nilai uang melampaui kapasitas kolom Decimal(12,2).");
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

export function derivePriceFactor(price: ExactDecimal, sourcePrice: ExactDecimal, conversion: ExactRatio): ExactRatio | null {
  const source = decimalToRatio(sourcePrice);
  return source.numerator === "0" ? null : divideRatios(decimalToRatio(price), multiplyRatios(source, conversion));
}

export function adjustmentToPriceFactor(kind: "DISCOUNT" | "MARKUP", percentage: ExactDecimal): ExactRatio {
  const ratio = decimalToRatio(percentage);
  const amount = BigInt(ratio.numerator);
  const whole = BigInt(ratio.denominator) * BigInt(100);
  if (kind !== "DISCOUNT" && kind !== "MARKUP") throw new Error("Jenis penyesuaian harga tidak valid.");
  if (kind === "DISCOUNT" && amount > whole) throw new Error("Diskon maksimal 100%.");
  return exactRatio((kind === "DISCOUNT" ? whole - amount : whole + amount).toString(), whole.toString());
}

function validConversion(member: GroupPricingMember): boolean {
  if (member.conversionNeedsReview) return false;
  try { return decimalToRatio(member.unitMultiplierToBase).numerator !== "0"; }
  catch { return false; }
}

function validateInput(input: GroupPricingInput) {
  const ids = new Set<string>();
  for (const member of input.members) {
    if (member.storeId !== input.storeId || member.groupId !== input.groupId || ids.has(member.id)) {
      throw new Error("Anggota harus unik dan berada di toko serta grup yang sama.");
    }
    ids.add(member.id);
    roundMoney(decimalToRatio(member.price));
    if (member.costPrice !== null) roundMoney(decimalToRatio(member.costPrice));
  }
  if (input.config) {
    if (input.config.initializationVersion !== 1 || !Number.isSafeInteger(input.config.revision) || input.config.revision < 1) {
      throw new Error("Versi konfigurasi harga tidak valid.");
    }
    for (const member of Object.values(input.config.members)) {
      if (member.mode !== "AUTO" && member.mode !== "MANUAL") throw new Error("Mode harga tidak valid.");
      if (member.factor) exactRatio(member.factor.numerator, member.factor.denominator);
    }
  }
}

function storedMember(member: GroupPricingMember): GroupPricingMemberProjection {
  return {
    productId: member.id,
    price: roundMoney(decimalToRatio(member.price)),
    costPrice: member.costPrice === null ? null : roundMoney(decimalToRatio(member.costPrice)),
    review: emptyReview(),
  };
}

function calculate(input: GroupPricingInput, initializing: boolean): GroupPricingProjection {
  validateInput(input);
  const existing = input.config;
  const candidates = input.members.filter(member => member.isActive && member.unit === input.baseUnit && validConversion(member));
  const sourceProductId = existing?.sourceProductId ?? (candidates.length === 1 ? candidates[0].id : null);
  const source = input.members.find(member => member.id === sourceProductId);
  const sourceReason: PricingReviewReason | null = source && source.isActive && validConversion(source)
    ? null
    : !sourceProductId && candidates.length > 1 ? "SOURCE_AMBIGUOUS" : "SOURCE_UNAVAILABLE";
  const memberConfig: GroupPricingConfig["members"] = Object.create(null);
  const members = input.members.map(member => {
    const result = storedMember(member);
    const previous = existing?.members[member.id];
    const config: GroupPricingMemberConfig = {
      mode: previous?.mode ?? (member.id === sourceProductId ? "AUTO" : "MANUAL"),
      factor: previous?.factor ? exactRatio(previous.factor.numerator, previous.factor.denominator) : null,
      review: result.review,
    };
    memberConfig[member.id] = config;
    if (config.mode === "MANUAL") return result;
    if (sourceReason) {
      result.review.price.push(sourceReason);
      result.review.costPrice.push(sourceReason);
      return result;
    }
    if (member.id === sourceProductId) {
      config.factor = { ...ONE };
      return result;
    }
    if (!validConversion(member)) {
      result.review.price.push("CONVERSION_INVALID");
      result.review.costPrice.push("CONVERSION_INVALID");
      return result;
    }
    const conversion = divideRatios(decimalToRatio(member.unitMultiplierToBase), decimalToRatio(source!.unitMultiplierToBase));
    const needsLegacyFactor = initializing || !!previous && previous.factor === null;
    if (needsLegacyFactor) config.factor = derivePriceFactor(member.price, source!.price, conversion);
    else if (!previous) config.factor = { ...ONE };
    if (config.factor === null) result.review.price.push("SOURCE_PRICE_ZERO");
    else if (!needsLegacyFactor) result.price = roundMoney(multiplyRatios(decimalToRatio(source!.price), conversion, config.factor));
    if (source!.costPrice === null) result.review.costPrice.push("SOURCE_COST_UNKNOWN");
    else result.costPrice = roundMoney(multiplyRatios(decimalToRatio(source!.costPrice), conversion));
    return result;
  });
  const config: GroupPricingConfig = {
    sourceProductId,
    revision: existing?.revision ?? 1,
    initializationVersion: 1,
    members: memberConfig,
  };
  if (existing) {
    if (existing.revision === Number.MAX_SAFE_INTEGER) throw new Error("Revisi konfigurasi melampaui batas.");
    config.revision += 1;
  }
  return { config, members, initialized: !existing };
}

export function initializeGroupPricing(input: GroupPricingInput): GroupPricingProjection {
  validateInput(input);
  if (input.config) return {
    config: input.config,
    initialized: false,
    members: input.members.map(member => ({ ...storedMember(member), review: input.config!.members[member.id]?.review ?? emptyReview() })),
  };
  return calculate(input, true);
}

export function projectGroupPricing(input: GroupPricingInput): GroupPricingProjection {
  return calculate(input, !input.config);
}
