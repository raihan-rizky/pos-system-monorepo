import { Worker } from "node:worker_threads";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OLD_GENERATION_SIZE_MB = 64;

const WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const XLSX = require("xlsx");

parentPort.on("message", (message) => {
  const options = message.options || {};

  try {
    const workbook = XLSX.read(message.buffer, {
      type: "array",
      raw: options.raw,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = sheet
      ? XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: options.raw,
          rawNumbers: options.rawNumbers,
        })
      : [];

    parentPort.postMessage({ ok: true, matrix });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: {
        name: error && error.name ? String(error.name) : "Error",
        message: error && error.message ? String(error.message) : "Unable to parse spreadsheet",
      },
    });
  }
});
`;

export type SpreadsheetParseOptions = {
  raw?: boolean;
  rawNumbers?: boolean;
  timeoutMs?: number;
  maxOldGenerationSizeMb?: number;
};

export class SpreadsheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetParseError";
  }
}

type WorkerResult =
  | { ok: true; matrix: unknown[][] }
  | { ok: false; error?: { name?: string; message?: string } };

export function parseSpreadsheetMatrix(
  buffer: ArrayBuffer,
  options: SpreadsheetParseOptions = {},
): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      resourceLimits: {
        maxOldGenerationSizeMb:
          options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GENERATION_SIZE_MB,
      },
    });

    const cleanup = () => {
      settled = true;
      clearTimeout(timeout);
      worker.removeAllListeners();
    };

    const fail = (error: Error) => {
      if (settled) return;
      cleanup();
      void worker.terminate();
      reject(error);
    };

    const timeout = setTimeout(() => {
      fail(new SpreadsheetParseError("Spreadsheet parsing timed out."));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    worker.once("message", (result: WorkerResult) => {
      if (settled) return;
      cleanup();
      void worker.terminate();

      if (result.ok) {
        resolve(result.matrix);
        return;
      }

      reject(
        new SpreadsheetParseError(
          result.error?.message || "Unable to parse spreadsheet.",
        ),
      );
    });

    worker.once("error", (error) => {
      fail(
        error instanceof Error
          ? error
          : new SpreadsheetParseError("Spreadsheet parser worker failed."),
      );
    });

    worker.once("exit", (code) => {
      if (settled || code === 0) return;
      fail(new SpreadsheetParseError(`Spreadsheet parser exited with code ${code}.`));
    });

    worker.postMessage({
      buffer,
      options: {
        raw: options.raw,
        rawNumbers: options.rawNumbers,
      },
    });
  });
}
