/**
 * Centralized configuration — single source of truth for all env vars.
 *
 * Backend guideline: never use process.env directly. Import from this file.
 */

export const unifiedConfig = {
  ai: {
    nebiusApiKey: process.env.NEBIUS_API_KEY?.trim() ?? "",
    nebiusModel: process.env.NEBIUS_MODEL?.trim() ?? "Qwen/Qwen2.5-72B-Instruct",
    fastPathIntents: process.env.AI_FAST_PATH_INTENTS?.trim() ?? "",
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  },
  app: {
    environment: process.env.NODE_ENV ?? "development",
  },
} as const;
