import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "./fixtures/app";

function startWorkflowServer() {
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

    response.write(`data: ${JSON.stringify({
      type: "progress",
      status: "planning",
      occurredAt: "2026-06-29T08:00:00.000Z",
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      type: "final",
      answer: {
        responseKind: "workflow",
        answerMarkdown: "Bisa, ini alur aman untuk **menambahkan produk baru**.",
        dataStatus: "help_docs",
        sourceLabel: "FAQ Operasional",
        sourceRefs: ["docs/help/faq.md#q1-bagaimana-cara-menambahkan-produk-baru-ke-katalog-toko"],
        generatedAt: "2026-06-29T08:00:01.000Z",
        followUps: [],
        workflow: {
          id: "faq-q01-add-product",
          title: "Bagaimana cara menambahkan produk baru ke katalog toko?",
          route: "/products",
          actionLabel: "Buka Produk",
          sourceRef: "docs/help/faq.md#q1-bagaimana-cara-menambahkan-produk-baru-ke-katalog-toko",
          steps: [
            {
              id: "faq-q01-add-product-step-1",
              title: "Buka katalog produk",
              description: "Masuk ke sidebar Katalog, lalu buka halaman Produk.",
              route: "/products",
              actionLabel: "Buka Produk",
              iconKey: "package",
            },
            {
              id: "faq-q01-add-product-step-2",
              title: "Mulai tambah produk",
              description: "Klik tombol Tambah Produk di kanan atas halaman.",
              route: "/products",
              actionLabel: "Buka Produk",
              iconKey: "package",
            },
          ],
        },
      },
    })}\n\n`);
    response.write("data: [DONE]\n\n");
    response.end();
  });

  return new Promise<{ server: Server; url: string; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/stream`,
        stop: async () => {
          await new Promise<void>((done) => server.close(() => done()));
        },
      });
    });
  });
}

test("assistant renders a guided workflow and navigates only after user clicks", async ({ appPage: page }) => {
  const workflowServer = await startWorkflowServer();

  try {
    await page.addInitScript(({ streamUrl }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (typeof input === "string" && input === "/api/ai/chat") {
          return originalFetch(streamUrl, init);
        }
        return originalFetch(input, init);
      };
    }, { streamUrl: workflowServer.url });

    await page.goto("/help");
    await page.locator(".floating-ai-button").click();
    await page.locator("textarea").fill("Cara tambah produk baru gimana?");
    await page.locator("textarea").press("Enter");

    await expect(page.getByRole("button", { name: "Buka katalog produk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mulai tambah produk" })).toBeVisible();
    await expect(page).toHaveURL(/\/help/);

    const navigationLink = page.getByRole("link", { name: "Buka Produk" }).first();
    await expect(navigationLink).toHaveAttribute("href", "/products");
    await navigationLink.click();

    await expect(page).toHaveURL(/\/products/);
    await expect(page.getByRole("heading", { name: "Pusat Produk" })).toBeVisible();
  } finally {
    await workflowServer.stop();
  }
});
