import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "./fixtures/app";

function startProgressServer() {
  const timers: NodeJS.Timeout[] = [];
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    response.flushHeaders();

    const write = (payload: unknown) => {
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    write({
      type: "progress",
      status: "planning",
      occurredAt: "2026-06-27T01:00:00.000Z",
    });
    timers.push(setTimeout(() => {
      write({
        type: "progress",
        status: "tool_selected",
        toolName: "get_low_stock_items",
        occurredAt: "2026-06-27T01:00:00.500Z",
      });
      write({
        type: "progress",
        status: "tool_running",
        toolName: "get_low_stock_items",
        occurredAt: "2026-06-27T01:00:00.600Z",
      });
    }, 500));
    timers.push(setTimeout(() => {
      write({
        type: "progress",
        status: "answer_generating",
        occurredAt: "2026-06-27T01:00:01.000Z",
      });
    }, 1_000));
    timers.push(setTimeout(() => {
      write({
        type: "final",
        answer: {
          answerMarkdown: "Progress selesai dengan benar.",
          dataStatus: "live_data",
          sourceLabel: "E2E data",
          generatedAt: "2026-06-27T01:00:01.500Z",
          followUps: [],
        },
      });
      response.write("data: [DONE]\n\n");
      response.end();
    }, 1_500));
  });

  return new Promise<{ server: Server; url: string; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/stream`,
        stop: async () => {
          timers.forEach(clearTimeout);
          await new Promise<void>((done) => server.close(() => done()));
        },
      });
    });
  });
}

test("shows assistant progress while the response is still streaming", async ({ appPage: page }) => {
  const progressServer = await startProgressServer();

  try {
    await page.addInitScript(({ streamUrl }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (typeof input === "string" && input === "/api/ai/chat") {
          return originalFetch(streamUrl, init);
        }
        return originalFetch(input, init);
      };
    }, { streamUrl: progressServer.url });

    await page.goto("/help");
    await page.locator(".floating-ai-button").click();
    await page.locator("textarea").fill("Cek stok rendah");
    await page.locator("textarea").press("Enter");

    await expect(page.getByText("Processing request", { exact: true })).toBeVisible();
    await expect(page.getByText("Checking data", { exact: true })).toBeVisible();
    await expect(page.getByText("Preparing response", { exact: true })).toBeVisible();
    await expect(page.getByText("Progress selesai dengan benar.", { exact: true })).toBeVisible();
  } finally {
    await progressServer.stop();
  }
});
