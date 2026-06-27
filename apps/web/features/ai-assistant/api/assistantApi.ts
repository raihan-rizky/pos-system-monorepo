import { AssistantStreamFrame, ChatRequest } from '../types/assistant';

export async function sendChatMessage(request: ChatRequest): Promise<AsyncIterable<AssistantStreamFrame>> {
  const payload: ChatRequest = {
    ...request,
    messages: request.messages
      .filter((message) => message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content })),
  };
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send message');
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  return readAssistantStream(response.body);
}

function parseSseFrame(frame: string): AssistantStreamFrame | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');

  if (!data || data === '[DONE]') return null;

  try {
    return JSON.parse(data) as AssistantStreamFrame;
  } catch (error) {
    console.error('Failed to parse stream data', error);
    return null;
  }
}

export async function* readAssistantStream(
  body: ReadableStream<Uint8Array>
): AsyncIterable<AssistantStreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const parsed = parseSseFrame(frame);
        if (parsed) yield parsed;
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
    }

    buffer += decoder.decode();
    const trailing = parseSseFrame(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}
