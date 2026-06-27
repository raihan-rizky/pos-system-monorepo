import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssistantRequestError,
  AssistantStreamProtocolError,
  readAssistantStream,
  sendChatMessage,
} from "../assistantApi";

const finalAnswer = {
  answerMarkdown: "Done",
  dataStatus: "no_tool_used" as const,
  sourceLabel: "Pak Teladan",
  generatedAt: "2026-06-27T01:00:01.000Z",
  followUps: [],
};

function finalFrame(lineEnding = "\n") {
  return `data: ${JSON.stringify({ type: "final", answer: finalAnswer })}${lineEnding}${lineEnding}`;
}

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
      finalFrame(),
      "data: [DONE]\n\n",
    ])));

    const stream = await sendChatMessage({
      messages: [{ role: "user", content: "halo" }],
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "progress", status: "planning", occurredAt },
      { type: "final", answer: finalAnswer },
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
          controller.enqueue(encoder.encode(finalFrame()));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        };
      },
    }), {
      headers: { "Content-Type": "text/event-stream" },
    });
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
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it("parses CRLF-delimited SSE frames", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"progress",\r\ndata: "status":"planning","occurredAt":"2026-06-27T01:00:00.000Z"}\r\n\r\n'
          + finalFrame("\r\n")
          + "data: [DONE]\r\n\r\n",
        ));
        controller.close();
      },
    });

    await expect(collect(readAssistantStream(body))).resolves.toEqual([
      { type: "progress", status: "planning", occurredAt: "2026-06-27T01:00:00.000Z" },
      { type: "final", answer: finalAnswer },
    ]);
  });

  it("rejects a stream that ends before the final answer", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"progress","status":"planning","occurredAt":"2026-06-27T01:00:00.000Z"}\n\n',
        ));
        controller.close();
      },
    });

    await expect(collect(readAssistantStream(body))).rejects.toThrow("before the final answer");
  });

  it("rejects a stream that ends without the done sentinel", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(finalFrame()));
        controller.close();
      },
    });

    await expect(collect(readAssistantStream(body))).rejects.toThrow("before [DONE]");
  });

  it("rejects malformed stream JSON", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: {not-json}\n\n"));
        controller.close();
      },
    });

    await expect(collect(readAssistantStream(body))).rejects.toBeInstanceOf(AssistantStreamProtocolError);
  });

  it("cancels the response body when the consumer stops early", async () => {
    const encoder = new TextEncoder();
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"progress","status":"planning","occurredAt":"2026-06-27T01:00:00.000Z"}\n\n',
        ));
      },
      cancel,
    });
    const iterator = readAssistantStream(body)[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await iterator.return?.();

    expect(cancel).toHaveBeenCalledTimes(1);
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

  it("preserves the HTTP status for a user-correctable request error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Request AI terlalu besar." }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    )));

    const error = await sendChatMessage({
      messages: [{ role: "user", content: "too large" }],
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(AssistantRequestError);
    expect(error).toMatchObject({ status: 413, message: "Request AI terlalu besar." });
  });

  it("forwards the caller abort signal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFromChunks([
      finalFrame(),
      "data: [DONE]\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await sendChatMessage(
      { messages: [{ role: "user", content: "halo" }] },
      { signal: controller.signal },
    );

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});
