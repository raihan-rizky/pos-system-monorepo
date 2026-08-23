const RUNTIME_MISMATCH_PATTERNS = [
  /cannot read properties of undefined \(reading ['"]call['"]\)/i,
  /chunkloaderror/i,
  /loading (?:css )?chunk .* failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
];

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : undefined;
    return `${error.name} ${error.message} ${cause ? errorText(cause) : ""}`;
  }

  return typeof error === "string" ? error : "";
}

export function isClientRuntimeMismatch(error: unknown): boolean {
  const text = errorText(error);
  return RUNTIME_MISMATCH_PATTERNS.some((pattern) => pattern.test(text));
}

interface AppCacheStorage {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

interface AppServiceWorkerRegistration {
  update(): Promise<unknown>;
  waiting: { postMessage(message: unknown): void } | null;
}

interface AppServiceWorkerContainer {
  getRegistration(): Promise<AppServiceWorkerRegistration | undefined>;
}

export interface AppReloadDependencies {
  cacheStorage?: AppCacheStorage;
  serviceWorker?: AppServiceWorkerContainer;
  reload: () => void;
}

function browserReloadDependencies(): AppReloadDependencies {
  return {
    cacheStorage: typeof caches === "undefined" ? undefined : caches,
    serviceWorker:
      typeof navigator === "undefined" || !("serviceWorker" in navigator)
        ? undefined
        : navigator.serviceWorker,
    reload: () => window.location.reload(),
  };
}

export async function reloadLatestAppVersion(
  overrides: Partial<AppReloadDependencies> = {},
): Promise<void> {
  const dependencies = { ...browserReloadDependencies(), ...overrides };
  const cleanupTasks: Promise<unknown>[] = [];

  if (dependencies.cacheStorage) {
    cleanupTasks.push(
      dependencies.cacheStorage.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pos-"))
            .map((key) => dependencies.cacheStorage?.delete(key)),
        ),
      ),
    );
  }

  if (dependencies.serviceWorker) {
    cleanupTasks.push(
      dependencies.serviceWorker.getRegistration().then(async (registration) => {
        if (!registration) return;
        await registration.update();
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      }),
    );
  }

  await Promise.allSettled(cleanupTasks);
  dependencies.reload();
}
