import { afterEach, describe, expect, it, vi } from "vitest";

import { readAssistantStream, sendChatMessage } from "../assistantApi";

function responseFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collect<T>(iterable: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe("sendChatMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves a progress frame split across network chunks", async () => {
    const occurredAt = "2026-06-27T01:00:00.000Z";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromChunks([
      'data: {"type":"progress","status":',
      `"planning","occurredAt":"${occurredAt}"}\n\n`,
      "data: [DONE]\n\n",
    ])));

    const stream = await sendChatMessage({
      messages: [{ role: "user", content: "halo" }],
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "progress", status: "planning", occurredAt },
    ]);
  });

  it("yields progress before a later final frame is available", async () => {
    const encoder = new TextEncoder();
    let sendFinal: () => void = () => {};
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"progress","status":"planning","occurredAt":"2026-06-27T01:00:00.000Z"}\n\n',
        ));
        sendFinal = () => {
          controller.enqueue(encoder.encode(
            'data: {"type":"final","answer":{"answerMarkdown":"Done","dataStatus":"no_tool_used","sourceLabel":"Pak Teladan","generatedAt":"2026-06-27T01:00:01.000Z","followUps":[]}}\n\n',
          ));
          controller.close();
        };
      },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const stream = await sendChatMessage({ messages: [{ role: "user", content: "halo" }] });
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: "progress", status: "planning" },
    });
    sendFinal();
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: "final" },
    });
  });

  it("parses CRLF-delimited SSE frames", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"progress",\r\ndata: "status":"planning","occurredAt":"2026-06-27T01:00:00.000Z"}\r\n\r\n',
        ));
        controller.close();
      },
    });

    await expect(collect(readAssistantStream(body))).resolves.toEqual([
      { type: "progress", status: "planning", occurredAt: "2026-06-27T01:00:00.000Z" },
    ]);
  });

  it("omits UI-only assistant status messages from the request payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFromChunks([
      "data: [DONE]\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);

    await sendChatMessage({
      messages: [
        { role: "user", content: "first question" },
        {
          role: "assistant",
          content: "",
          actionLog: [{
            id: "failed-1",
            label: "Response interrupted",
            status: "failed",
            occurredAt: "2026-06-27T01:00:00.000Z",
          }],
        },
        { role: "user", content: "second question" },
      ],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      messages: [
        { role: "user", content: "first question" },
        { role: "user", content: "second question" },
      ],
    });
  });
});
