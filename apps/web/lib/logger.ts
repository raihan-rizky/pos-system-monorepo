const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: 100 } as const;

export type LogLevel = keyof typeof LEVELS;

type LogContext = Record<string, unknown>;

type LogFn = (...args: unknown[]) => void;

export interface Logger {
  level: LogLevel;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  log: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child: (bindings: LogContext) => Logger;
}

declare const process: { env?: Record<string, string | undefined> } | undefined;

function readEnv(key: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process?.env) {
      return process.env[key];
    }
  } catch {
    // ignore
  }
  return undefined;
}

function resolveDefaultLevel(): LogLevel {
  const explicit = readEnv("LOG_LEVEL")?.toLowerCase();
  if (explicit && explicit in LEVELS) return explicit as LogLevel;
  const nodeEnv = readEnv("NODE_ENV");
  if (nodeEnv === "production") return "info";
  if (nodeEnv === "test") return "warn";
  return "debug";
}

function isBrowser(): boolean {
   
  return typeof (globalThis as any).window !== "undefined" && typeof (globalThis as any).document !== "undefined";
}

function shouldUsePretty(): boolean {
  if (isBrowser()) return true;
  const nodeEnv = readEnv("NODE_ENV");
  const explicit = readEnv("LOG_PRETTY");
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  return nodeEnv !== "production";
}

const REDACT_KEYS = new Set([
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "x-api-key",
  "apikey",
  "secret",
  "vapidprivatekey",
]);

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[Truncated]";
  if (value instanceof Error) {
     
    const anyErr = value as any;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(anyErr.cause ? { cause: redact(anyErr.cause, depth + 1) } : {}),
      ...(anyErr.statusCode ? { statusCode: anyErr.statusCode } : {}),
      ...(anyErr.code ? { code: anyErr.code } : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        out[k] = "[Redacted]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "\u001b[90m",
  debug: "\u001b[36m",
  info: "\u001b[32m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
  fatal: "\u001b[35m",
  silent: "",
};
const RESET = "\u001b[0m";

// Convert variadic args (console-style) into { msg, ctx }.
function normalizeArgs(args: unknown[]): { msg: string; ctx: LogContext } {
  if (args.length === 0) return { msg: "", ctx: {} };

  // Common pattern: (msg: string, ctx: object)
  if (
    args.length === 2 &&
    typeof args[0] === "string" &&
    args[1] !== null &&
    typeof args[1] === "object" &&
    !(args[1] instanceof Error) &&
    !Array.isArray(args[1])
  ) {
    return { msg: args[0] as string, ctx: { ...(args[1] as LogContext) } };
  }

  // Common pattern: (msg: string, error: Error|unknown)
  if (args.length === 2 && typeof args[0] === "string") {
    const second = args[1];
    if (second instanceof Error) {
      return { msg: args[0] as string, ctx: { error: second } };
    }
  }

  // Fallback: stringify each arg, pull objects/errors into ctx by index.
  const parts: string[] = [];
  const ctx: LogContext = {};
  let extraIdx = 0;
  for (const arg of args) {
    if (arg instanceof Error) {
      ctx[extraIdx === 0 ? "error" : `error_${extraIdx}`] = arg;
      parts.push(arg.message);
      extraIdx++;
    } else if (arg !== null && typeof arg === "object") {
      ctx[`extra_${extraIdx}`] = arg;
      extraIdx++;
    } else {
      parts.push(String(arg));
    }
  }
  return { msg: parts.join(" ").trim(), ctx };
}

function formatPretty(level: LogLevel, name: string | undefined, msg: string, ctx: LogContext): string {
  const time = new Date().toISOString();
  const color = isBrowser() ? "" : LEVEL_COLORS[level];
  const reset = isBrowser() ? "" : RESET;
  const tag = name ? ` [${name}]` : "";
  const ctxStr = Object.keys(ctx).length > 0 ? " " + JSON.stringify(redact(ctx)) : "";
  return `${color}${time} ${level.toUpperCase().padEnd(5)}${reset}${tag} ${msg}${ctxStr}`;
}

function emit(level: LogLevel, name: string | undefined, bindings: LogContext, args: unknown[]) {
  const { msg, ctx } = normalizeArgs(args);
  const merged: LogContext = { ...bindings, ...ctx };
  const payload = redact(merged) as LogContext;

  if (shouldUsePretty()) {
    const line = formatPretty(level, name, msg, payload);
    if (level === "error" || level === "fatal") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "debug" || level === "trace") console.debug(line);
    else console.log(line);
    return;
  }

  const record = {
    time: new Date().toISOString(),
    level,
    name,
    msg,
    ...payload,
  };
  const line = JSON.stringify(record);
  if (level === "error" || level === "fatal") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug" || level === "trace") console.debug(line);
  else console.log(line);
}

function createLogger(name?: string, bindings: LogContext = {}): Logger {
  const level = resolveDefaultLevel();
  const threshold = LEVELS[level];

  function makeFn(target: LogLevel): LogFn {
    if (LEVELS[target] < threshold) {
      return () => {};
    }
    return (...args: unknown[]) => emit(target, name, bindings, args);
  }

  return {
    level,
    trace: makeFn("trace"),
    debug: makeFn("debug"),
    info: makeFn("info"),
    log: makeFn("info"),
    warn: makeFn("warn"),
    error: makeFn("error"),
    fatal: makeFn("fatal"),
    child(extra) {
      const merged = { ...bindings, ...extra };
      const childName = typeof extra.name === "string" ? extra.name : name;
      return createLogger(childName, merged);
    },
  };
}

export const logger: Logger = createLogger("app");

export function getLogger(name: string, bindings: LogContext = {}): Logger {
  return createLogger(name, bindings);
}
