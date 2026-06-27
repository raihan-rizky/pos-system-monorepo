import { AssistantStreamFrame, ChatRequest } from '../types/assistant';

export class AssistantRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'AssistantRequestError';
  }
}

export class AssistantStreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantStreamProtocolError';
  }
}

type SendChatMessageOptions = {
  signal?: AbortSignal;
};

type ParsedSseFrame =
  | { kind: 'event'; value: AssistantStreamFrame }
  | { kind: 'done' }
  | { kind: 'ignore' };

export async function sendChatMessage(
  request: ChatRequest,
  options: SendChatMessageOptions = {},
): Promise<AsyncIterable<AssistantStreamFrame>> {
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
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new AssistantRequestError(error?.error || 'Failed to send message', response.status);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/event-stream')) {
    throw new AssistantStreamProtocolError('AI response is not an event stream');
  }

  return readAssistantStream(response.body);
}

function parseSseFrame(frame: string): ParsedSseFrame {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');

  if (!data) return { kind: 'ignore' };
  if (data === '[DONE]') return { kind: 'done' };

  try {
    const value = JSON.parse(data) as unknown;
    if (!value || typeof value !== 'object') {
      throw new AssistantStreamProtocolError('AI stream contained an invalid event');
    }
    return { kind: 'event', value: value as AssistantStreamFrame };
  } catch (error) {
    if (error instanceof AssistantStreamProtocolError) throw error;
    throw new AssistantStreamProtocolError('AI stream contained malformed JSON');
  }
}

export async function* readAssistantStream(
  body: ReadableStream<Uint8Array>
): AsyncIterable<AssistantStreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reachedEof = false;
  let sawFinal = false;
  let sawDone = false;

  const consumeFrame = (frame: string) => {
    const parsed = parseSseFrame(frame);
    if (parsed.kind === 'done') {
      sawDone = true;
      return null;
    }
    if (parsed.kind === 'ignore') return null;
    if (sawDone) {
      throw new AssistantStreamProtocolError('AI stream sent data after [DONE]');
    }
    if ('type' in parsed.value && parsed.value.type === 'final') {
      sawFinal = true;
    }
    return parsed.value;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const parsed = consumeFrame(frame);
        if (parsed) yield parsed;
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
    }

    buffer += decoder.decode();
    const trailing = consumeFrame(buffer);
    if (trailing) yield trailing;

    if (!sawFinal) {
      throw new AssistantStreamProtocolError('AI stream ended before the final answer');
    }
    if (!sawDone) {
      throw new AssistantStreamProtocolError('AI stream ended before [DONE]');
    }
  } finally {
    if (!reachedEof) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
