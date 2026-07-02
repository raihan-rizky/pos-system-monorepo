import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ONCE_RESULT_PREFIX = "PRODUCT_IMPORT_WORKER_ONCE_RESULT ";

type OnceResult = {
  processed: boolean;
};

type SpawnProcessOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type SpawnProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnProcessOptions
) => Promise<SpawnProcessResult>;

export type ProcessOnceRunnerOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  execArgv?: string[];
  forwardOutput?: boolean;
  processOnceScriptPath?: string;
  spawnProcess?: SpawnProcess;
};

export function log(message: string, meta?: Record<string, unknown>) {
  const payload = {
    time: new Date().toISOString(),
    name: "product-import-worker",
    message,
    ...(meta ?? {}),
  };
  console.warn(JSON.stringify(payload));
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultProcessOnceScriptPath() {
  return fileURLToPath(new URL("./process-once.ts", import.meta.url));
}

function defaultSpawnProcess(
  command: string,
  args: string[],
  options: SpawnProcessOptions
): Promise<SpawnProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function parseOnceResult(stdout: string): OnceResult {
  const lines = stdout.split(/\r?\n/);
  let resultLine: string | undefined;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.startsWith(ONCE_RESULT_PREFIX)) {
      resultLine = line;
      break;
    }
  }

  if (!resultLine) {
    throw new Error("Product import worker child did not report a result.");
  }

  const rawPayload = resultLine.slice(ONCE_RESULT_PREFIX.length);
  const parsed = JSON.parse(rawPayload) as Partial<OnceResult>;

  return {
    processed: Boolean(parsed.processed),
  };
}

export function createProcessOnceRunner(options: ProcessOnceRunnerOptions = {}) {
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
  const processOnceScriptPath =
    options.processOnceScriptPath ?? defaultProcessOnceScriptPath();
  const execArgv = options.execArgv ?? process.execArgv;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const forwardOutput = options.forwardOutput ?? true;

  return async function processOnce() {
    const result = await spawnProcess(
      process.execPath,
      [...execArgv, processOnceScriptPath],
      {
        cwd,
        env,
      }
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Product import worker child exited with code ${result.exitCode ?? "unknown"}.${
          result.stderr ? `\n${result.stderr}` : ""
        }`
      );
    }

    if (forwardOutput) {
      const passthroughStdout = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.length > 0 && !line.startsWith(ONCE_RESULT_PREFIX))
        .join("\n");

      if (passthroughStdout) {
        process.stdout.write(`${passthroughStdout}\n`);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }

    return parseOnceResult(result.stdout).processed;
  };
}
