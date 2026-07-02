import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import * as vm from "node:vm";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

const require = createRequire(import.meta.url);
const xlsxCommonJs = require("xlsx") as typeof XLSX;
const originalRead = xlsxCommonJs.read;

describe("parseSpreadsheetMatrix", () => {
  afterEach(() => {
    xlsxCommonJs.read = originalRead;
    vi.restoreAllMocks();
    vi.doUnmock("node:worker_threads");
    vi.doUnmock("node:module");
  });

  it("decodes spreadsheets outside the main xlsx module instance", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["name", "stock"],
      ["Kertas HVS", 5],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    xlsxCommonJs.read = () => {
      throw new Error("main-thread parser should not run");
    };

    await expect(parseSpreadsheetMatrix(buffer)).resolves.toEqual([
      ["name", "stock"],
      ["Kertas HVS", "5"],
    ]);
  });

  it("loads xlsx in production-style worker eval from the traced module path", async () => {
    vi.resetModules();
    vi.doMock("node:worker_threads", () => ({
      Worker: class ProductionLikeWorker extends EventEmitter {
        private initError: Error | null = null;
        private readonly parentPort: EventEmitter & {
          postMessage: (result: unknown) => void;
        };

        constructor(
          source: string,
          options: { workerData?: { xlsxModulePath?: string } } = {},
        ) {
          super();
          this.parentPort = new EventEmitter() as EventEmitter & {
            postMessage: (result: unknown) => void;
          };
          this.parentPort.postMessage = (result: unknown) => {
            queueMicrotask(() => this.emit("message", result));
          };

          try {
            vm.runInNewContext(source, {
              require: (id: string) => {
                if (id === "node:worker_threads") {
                  return {
                    parentPort: this.parentPort,
                    workerData: options.workerData,
                  };
                }

                if (id === options.workerData?.xlsxModulePath) {
                  return xlsxCommonJs;
                }

                const error = new Error(`Cannot find module '${id}'`);
                (error as NodeJS.ErrnoException).code = "MODULE_NOT_FOUND";
                throw error;
              },
              queueMicrotask,
            });
          } catch (error) {
            this.initError =
              error instanceof Error ? error : new Error(String(error));
          }
        }

        override once(
          eventName: string | symbol,
          listener: (...args: unknown[]) => void,
        ): this {
          super.once(eventName, listener);
          if (eventName === "error" && this.initError) {
            queueMicrotask(() => this.emit("error", this.initError));
          }
          return this;
        }

        postMessage(message: unknown) {
          if (this.initError) return;
          queueMicrotask(() => this.parentPort.emit("message", message));
        }

        terminate(): Promise<number> {
          return Promise.resolve(0);
        }
      },
    }));

    const { parseSpreadsheetMatrix: parseWithMockedWorker } = await import(
      "@/lib/server/spreadsheet-parser"
    );
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["name", "phone"],
      ["CV Sinar", "08123456789"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    await expect(parseWithMockedWorker(buffer)).resolves.toEqual([
      ["name", "phone"],
      ["CV Sinar", "08123456789"],
    ]);
  });

  it("falls back to the xlsx package name when bundling resolves xlsx to a numeric module id", async () => {
    vi.resetModules();
    vi.doMock("node:module", () => ({
      createRequire: () =>
        Object.assign(
          (id: string) => {
            if (id === "xlsx") return xlsxCommonJs;
            const error = new Error(`Cannot find module '${id}'`);
            (error as NodeJS.ErrnoException).code = "MODULE_NOT_FOUND";
            throw error;
          },
          {
            resolve: (id: string) => (id === "xlsx" ? 69736 : id),
          },
        ),
    }));
    vi.doMock("node:worker_threads", () => ({
      Worker: class NumericModuleIdWorker extends EventEmitter {
        private initError: Error | null = null;
        private readonly parentPort: EventEmitter & {
          postMessage: (result: unknown) => void;
        };

        constructor(
          source: string,
          options: { workerData?: { xlsxModulePath?: unknown } } = {},
        ) {
          super();
          this.parentPort = new EventEmitter() as EventEmitter & {
            postMessage: (result: unknown) => void;
          };
          this.parentPort.postMessage = (result: unknown) => {
            queueMicrotask(() => this.emit("message", result));
          };

          try {
            vm.runInNewContext(source, {
              require: (id: string) => {
                if (id === "node:worker_threads") {
                  return {
                    parentPort: this.parentPort,
                    workerData: options.workerData,
                  };
                }

                if (id === "xlsx") {
                  return xlsxCommonJs;
                }

                const error = new Error(`Cannot find module '${id}'`);
                (error as NodeJS.ErrnoException).code = "MODULE_NOT_FOUND";
                throw error;
              },
              queueMicrotask,
            });
          } catch (error) {
            this.initError =
              error instanceof Error ? error : new Error(String(error));
          }
        }

        override once(
          eventName: string | symbol,
          listener: (...args: unknown[]) => void,
        ): this {
          super.once(eventName, listener);
          if (eventName === "error" && this.initError) {
            queueMicrotask(() => this.emit("error", this.initError));
          }
          return this;
        }

        postMessage(message: unknown) {
          if (this.initError) return;
          queueMicrotask(() => this.parentPort.emit("message", message));
        }

        terminate(): Promise<number> {
          return Promise.resolve(0);
        }
      },
    }));

    const { parseSpreadsheetMatrix: parseWithNumericModuleId } = await import(
      "@/lib/server/spreadsheet-parser"
    );
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["name", "phone"],
      ["CV Sinar", "08123456789"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    await expect(parseWithNumericModuleId(buffer)).resolves.toEqual([
      ["name", "phone"],
      ["CV Sinar", "08123456789"],
    ]);
  });
});
