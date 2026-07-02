import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProcessOnceRunner } from "../runner.ts";

describe("product import worker runner", () => {
  it("starts a fresh worker child process for every run", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runOnce = createProcessOnceRunner({
      execArgv: ["--loader", "tsx"],
      processOnceScriptPath: "process-once.ts",
      spawnProcess: async (command, args) => {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: `PRODUCT_IMPORT_WORKER_ONCE_RESULT ${JSON.stringify({ processed: calls.length === 1 })}\n`,
          stderr: "",
        };
      },
    });

    assert.equal(await runOnce(), true);
    assert.equal(await runOnce(), false);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.args), [
      ["--loader", "tsx", "process-once.ts"],
      ["--loader", "tsx", "process-once.ts"],
    ]);
  });
});
