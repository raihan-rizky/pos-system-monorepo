import type { AssistantActionLogEntry, AssistantMessageMetadata, Message } from "../types/assistant";

export function appendUserMessage(messages: Message[], content: string): Message[] {
  return keepRecentMessages([...messages, { role: "user", content }]);
}

export function appendAssistantChunk(messages: Message[], content: string): Message[] {
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    return [
      ...messages.slice(0, -1),
      { ...last, content: `${last.content}${content}` },
    ];
  }

  return [...messages, { role: "assistant", content }];
}

export function setAssistantFinalContent(messages: Message[], content: string): Message[] {
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    return [
      ...messages.slice(0, -1),
      { ...last, content },
    ];
  }

  return [...messages, { role: "assistant", content }];
}

export function appendAssistantMetadata(
  messages: Message[],
  metadata: AssistantMessageMetadata,
): Message[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return messages;

  return [
    ...messages.slice(0, -1),
    { ...last, metadata },
  ];
}

export function appendAssistantActionLogEntry(
  messages: Message[],
  entry: Omit<AssistantActionLogEntry, "id">,
): Message[] {
  const nextEntry: AssistantActionLogEntry = {
    ...entry,
    id: `${entry.label}-${entry.occurredAt}`,
  };
  const last = messages[messages.length - 1];
  const baseMessages = last?.role === "assistant"
    ? messages
    : [...messages, { role: "assistant" as const, content: "" }];
  const assistant = baseMessages[baseMessages.length - 1];
  const actionLog = assistant.actionLog ?? [];
  const previous = actionLog[actionLog.length - 1];

  if (previous?.label === nextEntry.label) {
    return [
      ...baseMessages.slice(0, -1),
      {
        ...assistant,
        actionLog: [
          ...actionLog.slice(0, -1),
          { ...previous, status: nextEntry.status, occurredAt: nextEntry.occurredAt },
        ],
      },
    ];
  }

  return [
    ...baseMessages.slice(0, -1),
    {
      ...assistant,
      actionLog: [
        ...actionLog.map((item) =>
          item.status === "active"
            ? { ...item, status: "done" as const, occurredAt: nextEntry.occurredAt }
            : item,
        ),
        nextEntry,
      ],
    },
  ];
}

export function completeAssistantActionLog(messages: Message[]): Message[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant" || !last.actionLog?.length) return messages;

  return [
    ...messages.slice(0, -1),
    {
      ...last,
      actionLog: last.actionLog.map((item) => item.status === "active" ? { ...item, status: "done" as const } : item),
    },
  ];
}

export function appendAssistantActionFailure(
  messages: Message[],
  label: string,
  occurredAt: string,
): Message[] {
  return appendAssistantActionLogEntry(messages, { label, occurredAt, status: "failed" });
}

export function appendAssistantRequestStatus(messages: Message[], occurredAt: string): Message[] {
  return appendAssistantActionLogEntry(messages, {
    label: "Sending request",
    occurredAt,
    status: "active",
  });
}

export function setAssistantFollowUps(messages: Message[], followUps: string[]): Message[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return messages;
  return [...messages.slice(0, -1), { ...last, followUps }];
}

export function keepRecentMessages(messages: Message[]): Message[] {
  return messages.length > 20 ? messages.slice(-20) : messages;
}
