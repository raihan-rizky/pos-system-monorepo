"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import {
  appendAssistantActionFailure,
  appendAssistantActionLogEntry,
  appendAssistantChunk,
  appendAssistantMetadata,
  appendAssistantRequestStatus,
  appendUserMessage,
  completeAssistantActionLog,
  setAssistantFinalContent,
} from "../helpers/chat-state";
import { AssistantRequestError, sendChatMessage } from "../api/assistantApi";
import type { AssistantStreamFrame, Message } from "../types/assistant";
import { Send, Info, Bot, X, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { flushSync } from "react-dom";
import { AssistantActionLog } from "./AssistantActionLog";

const CHAT_HISTORY_KEY_PREFIX = "ai_assistant_history_";
const MAX_HISTORY_MESSAGES = 10;
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

type AssistantWidgetProps = {
  defaultOpen?: boolean;
  initialMessages?: Message[];
  userRole?: string;
};

function formatMetadataTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function progressStatusLabel(status: Extract<AssistantStreamFrame, { type: "progress" }>["status"]) {
  const labels: Record<Extract<AssistantStreamFrame, { type: "progress" }>["status"], string> = {
    planning: "Processing request",
    tool_selected: "Data check selected",
    tool_running: "Checking data",
    tool_retrying: "Retrying data check",
    answer_generating: "Preparing response",
  };

  return labels[status];
}

function waitForStatusPaint() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    const fallback = window.setTimeout(finish, 100);

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.clearTimeout(fallback);
        finish();
      }, 0);
    });
  });
}

export function AssistantWidget({ defaultOpen = false, initialMessages = [], userRole = "ADMIN" }: AssistantWidgetProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `${CHAT_HISTORY_KEY_PREFIX}${userRole}`;

  const [size, setSize] = useState<{ width?: number; height?: number }>({});
  const isResizing = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    };
  }, []);

  const startResize = (e: React.PointerEvent, direction: "top" | "left" | "top-left") => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    const startX = e.clientX;
    const startY = e.clientY;

    const rect = chatRef.current?.firstElementChild?.getBoundingClientRect();
    if (!rect) return;

    const startWidth = rect.width;
    const startHeight = rect.height;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isResizing.current) return;
      const deltaX = startX - moveEvent.clientX;
      const deltaY = startY - moveEvent.clientY;

      setSize((prev) => ({
        width: direction === "top" ? prev.width : Math.max(320, Math.min(window.innerWidth - 48, startWidth + deltaX)),
        height: direction === "left" ? prev.height : Math.max(400, Math.min(window.innerHeight - 100, startHeight + deltaY))
      }));
    };

    const handlePointerUp = () => {
      isResizing.current = false;
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  // Load history on mount or role change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.timestamp && parsed?.messages && Array.isArray(parsed.messages)) {
          const isExpired = Date.now() - parsed.timestamp > HISTORY_TTL_MS;
          if (!isExpired && parsed.messages.length > 0) {
            setMessages(parsed.messages);
            return;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load AI chat history", e);
    }
    // Fallback if expired, missing, or error
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Save history on messages change
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't save if it's just the initial empty state
    if (messages === initialMessages && messages.length === 0) return;
    
    try {
      const toSave = messages.slice(-MAX_HISTORY_MESSAGES);
      const data = {
        timestamp: Date.now(),
        messages: toSave,
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save AI chat history", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, storageKey]);

  const handleClearChat = () => {
    if (window.confirm("Apakah Anda yakin ingin menghapus riwayat chat ini?")) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setIsStreaming(false);
      setMessages([]);
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.warn("Failed to clear AI chat history", e);
      }
    }
  };

  const handleClose = () => {
    activeRequestRef.current?.abort();
    setOpen(false);
  };

  const charCount = input.length;
  const maxChars = 2000;
  const chatRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator = isStreaming && !(lastMessage?.role === "assistant" && lastMessage.actionLog?.length);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (open) {
      scrollToBottom();
    }
  }, [messages, open, isStreaming]);

  const templateQuestions = useMemo(() => {
    switch (userRole?.toUpperCase()) {
      case "INVENTORY":
        return ["Cek stok barang menipis", "Barang terlaris minggu ini", "Buat jadwal opname"];
      case "SALES":
      case "CASHIER":
        return ["Total penjualan shift ini", "Cek harga grosir produk", "Status retur pelanggan"];
      case "OWNER":
      case "ADMIN":
        return ["Ringkasan penjualan hari ini", "Cek stok barang rendah", "Bagaimana cara mengatur akses setiap role", "Ringkasan hutang piutang agen sabar subur"];
      default:
        return ["Bantu saya cek stok", "Ringkasan penjualan hari ini", "Cek surat jalan pending"];
    }
  }, [userRole]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  async function handleSend() {
    const content = input.trim();
    if (!content || isStreaming) return;

    const requestMessages = appendUserMessage(messages, content);
    setMessages(appendAssistantRequestStatus(requestMessages, new Date().toISOString()));
    setInput("");
    setError(null);
    setIsStreaming(true);
    const controller = new AbortController();
    activeRequestRef.current = controller;

    try {
      const stream = await sendChatMessage(
        { messages: requestMessages },
        { signal: controller.signal },
      );

      for await (const parsed of stream) {
        if (controller.signal.aborted || activeRequestRef.current !== controller) break;
        if ("type" in parsed && parsed.type === "progress") {
          const instantaneous = parsed.status === "tool_selected";
          flushSync(() => {
            setMessages((current) => appendAssistantActionLogEntry(current, {
              label: progressStatusLabel(parsed.status),
              occurredAt: parsed.occurredAt,
              status: instantaneous ? "done" : "active",
            }));
          });
          await waitForStatusPaint();
          continue;
        }
        if ("type" in parsed && parsed.type === "final") {
          setMessages((current) => completeAssistantActionLog(
            appendAssistantMetadata(
              setAssistantFinalContent(current, parsed.answer.answerMarkdown),
              {
                sourceLabel: parsed.answer.sourceLabel,
                generatedAt: parsed.answer.generatedAt,
                sourceRefs: parsed.answer.sourceRefs,
              },
            ),
          ));
          continue;
        }
        const chunk = parsed.message?.content;
        if (chunk) {
          setMessages((current) => appendAssistantChunk(current, chunk));
        }
        if (parsed.metadata) {
          setMessages((current) => appendAssistantMetadata(current, parsed.metadata!));
        }
      }
    } catch (caught) {
      if (!mountedRef.current || activeRequestRef.current !== controller) return;
      if (controller.signal.aborted) {
        setMessages((current) => appendAssistantActionFailure(current, "Response cancelled", new Date().toISOString()));
        setError(null);
        return;
      }
      const isRejectedRequest = caught instanceof AssistantRequestError && (caught.status === 400 || caught.status === 413);
      const isAccessDenied = caught instanceof AssistantRequestError && (caught.status === 401 || caught.status === 403);
      const failureLabel = isRejectedRequest
        ? "Request needs correction"
        : isAccessDenied
          ? "Access denied"
          : "Response interrupted";
      const safeMessage = isRejectedRequest
        ? caught.message
        : isAccessDenied
          ? "Sesi atau aksesmu tidak valid. Masuk kembali atau hubungi admin toko."
          : "Respons AI terputus sebelum jawaban selesai. Silakan coba lagi.";
      setMessages((current) => appendAssistantActionFailure(current, failureLabel, new Date().toISOString()));
      setError(safeMessage);
    } finally {
      if (mountedRef.current && activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsStreaming(false);
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        if (!(event.target as Element).closest(".floating-ai-button")) {
          setOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <motion.div
      className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end"
      drag
      dragMomentum={false}
      style={{ touchAction: "none" }}
    >
      <button
        type="button"
        className={`floating-ai-button relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 transform hover:scale-105 hover:shadow-[0_0_30px_rgba(12,152,233,0.8),0_0_50px_rgba(0,121,199,0.6)] ${open ? "rotate-90" : "rotate-0"}`}
        onClick={() => {
          if (open) activeRequestRef.current?.abort();
          setOpen((prev) => !prev);
        }}
        style={{
          background: "linear-gradient(135deg, rgba(12, 152, 233, 0.8) 0%, rgba(1, 96, 161, 0.8) 100%)",
          boxShadow: "0 0 20px rgba(12, 152, 233, 0.7), 0 0 40px rgba(0, 121, 199, 0.5), 0 0 60px rgba(1, 96, 161, 0.3)",
          border: "2px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-30"></div>
        <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
        <div className="relative z-10">
          {open ? <X className="w-8 h-8 text-white" /> : <Bot className="w-8 h-8 text-white" />}
        </div>
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-brand-500"></div>
      </button>

      {open && (
        <div
          ref={chatRef}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-24 right-0 origin-bottom-right animate-scale-in p-2"
        >
          <div
            className="relative flex flex-col rounded-3xl bg-gradient-to-br from-surface-800/95 to-surface-900/95 border border-surface-600/50 shadow-2xl backdrop-blur-3xl overflow-hidden"
            style={{
              width: size.width ? `${size.width}px` : "min(450px, calc(100vw - 3rem))",
              height: size.height ? `${size.height}px` : "min(600px, 80vh)",
              minWidth: "320px",
              minHeight: "400px",
              maxWidth: "90vw",
              maxHeight: "90vh"
            }}
          >
            {/* Resize Handles */}
            <div
              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-50 hover:bg-brand-500/50 transition-colors"
              onPointerDown={(e) => startResize(e, "top")}
            />
            <div
              className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize z-50 hover:bg-brand-500/50 transition-colors"
              onPointerDown={(e) => startResize(e, "left")}
            />
            <div
              className="absolute top-0 left-0 w-5 h-5 cursor-nwse-resize z-[51] hover:bg-brand-500/80 rounded-br-full transition-colors"
              onPointerDown={(e) => startResize(e, "top-left")}
            />

            <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-surface-700/50">
              <div className="flex items-center gap-2">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-success-500"></span>
                </div>
                <span className="text-sm font-semibold text-surface-200">Pak Teladan</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs font-medium bg-brand-900/60 text-brand-300 rounded-2xl">
                  Asisten
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20 rounded-2xl">
                  Toko
                </span>
                
                <div className="flex items-center ml-2 border-l border-surface-600/50 pl-2 gap-1">
                  <button
                    onClick={handleClearChat}
                    title="Hapus riwayat chat"
                    className="p-1.5 rounded-full hover:bg-danger-500/20 hover:text-danger-400 text-surface-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleClose}
                    className="p-1.5 rounded-full hover:bg-surface-700/50 transition-colors"
                  >
                    <X className="w-4 h-4 text-surface-400" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-surface-600 scrollbar-track-transparent text-sm">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-surface-400 opacity-80 gap-3">
                  <Bot className="w-12 h-12 text-surface-600" />
                  <p>Halo, saya siap membantu sesuai akses role kamu.</p>
                </div>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex flex-col max-w-[85%] ${message.role === "user" ? "self-end items-end" : "self-start items-start"}`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500 ml-1 mr-1">
                    {message.role === "user" ? "Kamu" : "AI"}
                  </p>
                  <div className={`px-4 py-3 rounded-2xl ${message.role === "user"
                    ? "bg-brand-600 text-white rounded-tr-sm"
                    : "bg-surface-700/70 text-surface-100 rounded-tl-sm border border-surface-600/30"
                    }`}>
                    {message.content ? (
                      <div className="prose prose-sm prose-invert max-w-none leading-relaxed prose-headings:text-base prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                        <ReactMarkdown components={{
                          h1: ({ node, ...props }) => <h3 {...props} />,
                          h2: ({ node, ...props }) => <h4 {...props} />,
                          h3: ({ node, ...props }) => <h5 {...props} />,
                          h4: ({ node, ...props }) => <h6 {...props} />,
                        }}>{message.content}</ReactMarkdown>
                      </div>
                    ) : null}
                    {message.role === "assistant" && message.actionLog?.length ? (
                      <AssistantActionLog entries={message.actionLog} />
                    ) : null}
                    {message.role === "assistant" && message.metadata ? (
                      <div className="mt-3 border-t border-surface-500/30 pt-2 text-[10px] text-surface-400">
                        Sumber: {message.metadata.sourceLabel} • {formatMetadataTime(message.metadata.generatedAt)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {showTypingIndicator ? (
                <div className="self-start items-start flex flex-col max-w-[85%]">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500 ml-1">AI</p>
                  <div className="px-4 py-3 rounded-2xl bg-surface-700/70 text-surface-100 rounded-tl-sm border border-surface-600/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              ) : null}
              {error ? (
                <div className="self-center mt-2 px-4 py-2 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs text-center">
                  {error}
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="relative border-t border-surface-700/50 bg-surface-800/50">
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={2}
                maxLength={maxChars}
                aria-describedby="assistant-character-limit"
                className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-transparent border-none outline-none resize-none text-sm leading-relaxed text-surface-50 placeholder-surface-500 scrollbar-none h-[60px] sm:h-[80px]"
                placeholder="Tanya AI, share ide, atau minta bantuan..."
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                disabled={isStreaming}
              />
            </div>

            <div className="px-4 pb-4 pt-1 bg-surface-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 max-w-[280px]">
                  {templateQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      disabled={isStreaming}
                      className="whitespace-nowrap px-3 py-1.5 text-[11px] font-medium rounded-full bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-surface-100 hover:bg-surface-700 hover:border-surface-600 transition-all duration-200 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-[10px] font-medium text-surface-500">
                    <span className={charCount === maxChars ? "text-danger-400" : undefined}>{charCount}</span>/<span className="text-surface-600">{maxChars}</span>
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={isStreaming || !input.trim()}
                    className="group relative p-2.5 bg-gradient-to-r from-brand-600 to-brand-500 border-none rounded-xl cursor-pointer transition-all duration-300 text-white shadow-lg hover:from-brand-500 hover:to-brand-400 hover:scale-105 hover:shadow-brand-500/30 active:scale-95 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <Send className={`w-4 h-4 transition-all duration-300 ${!isStreaming && input.trim() ? "group-hover:-translate-y-0.5 group-hover:translate-x-0.5" : ""}`} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 text-[10px] text-surface-500 gap-6">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3 h-3 opacity-70" />
                  <span>
                    Tekan <kbd className="px-1 py-0.5 bg-surface-800 border border-surface-600 rounded text-surface-400 font-mono text-[9px] mx-0.5">Shift + Enter</kbd> utk baris baru
                  </span>
                </div>
                <span id="assistant-character-limit" className="sr-only">
                  Maksimal 2.000 karakter per pesan.
                </span>
              </div>
            </div>

            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: "linear-gradient(135deg, rgba(12, 152, 233, 0.03), transparent, rgba(1, 96, 161, 0.03))"
              }}
            ></div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
