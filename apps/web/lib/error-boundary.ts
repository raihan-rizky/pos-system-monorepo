/**
 * Error boundary helper.
 * If Sentry is installed later (@sentry/nextjs), this file should wrap Sentry.captureException.
 * For now, it delegates to structured logging.
 */
import { getLogger } from "./logger";

const log = getLogger("error-boundary");

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (error instanceof Error) {
    log.error(`Exception captured: ${error.message}`, {
      stack: error.stack,
      name: error.name,
      ...context,
    });
  } else {
    log.error("Exception captured", { error, ...context });
  }

  // TODO: Add Sentry integration here per backend-dev-guidelines
  // Sentry.captureException(error, { extra: context });
}
