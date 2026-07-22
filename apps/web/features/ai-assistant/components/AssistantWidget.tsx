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
  setAssistantFollowUps,
  setAssistantGeneratedFile,
  setAssistantWorkflowPayload,
} from "../helpers/chat-state";
import { buildAssistantHistoryKey, sanitizeAssistantHistoryRecord } from "../helpers/chat-history";
import { AssistantRequestError, sendChatMessage } from "../api/assistantApi";
import type { AssistantClientAction, AssistantStreamFrame, Message } from "../types/assistant";
import { Send, Info, Bot, X, Trash2, Sparkles, ChevronLeft, ChevronRight, Download, FileText, Bell } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { flushSync } from "react-dom";
import { AssistantActionLog } from "./AssistantActionLog";
import { AssistantWorkflowMessage } from "./AssistantWorkflowMessage";
import { useRole } from "@/components/providers/RoleProvider";
import { usePathname, useRouter } from "next/navigation";
import {
  ASSISTANT_OPEN_MODAL_EVENT,
  executeAssistantClientAction,
} from "../helpers/assistant-client-actions";
import { useNotifications } from "@/features/notifications/components/NotificationProvider";
import type { AppNotification } from "@/features/notifications/types/notification";
import {
  getQuickPromptsForRole,
  isGlowingQuickPrompt,
} from "../helpers/quick-prompt-catalog";

const MAX_HISTORY_MESSAGES = 10;

type AssistantWidgetProps = {
  defaultOpen?: boolean;
  initialMessages?: Message[];
  userRole?: string;
  userId?: string | null;
  storeId?: string | null;
  authorizationFingerprint?: string | null;
  notificationSnapshot?: {
    unreadCount: number;
    notifications: AppNotification[];
    markAsRead: (id: string) => Promise<void> | void;
  };
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
    planning: "Memproses permintaan",
    tool_selected: "Memilih sumber data",
    tool_running: "Mengecek data",
    tool_retrying: "Mencoba ulang cek data",
    answer_generating: "Menyiapkan jawaban",
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

export function AssistantWidget({
  defaultOpen = false,
  initialMessages = [],
  userRole,
  userId,
  storeId,
  authorizationFingerprint,
  notificationSnapshot,
}: AssistantWidgetProps) {
  const roleContext = useRole();
  const effectiveRole = userRole ?? roleContext.role ?? "ADMIN";
  const effectiveUserId = userId ?? roleContext.userId;
  const effectiveStoreId = storeId ?? roleContext.storeId;
  const effectiveAuthorizationFingerprint = authorizationFingerprint ?? roleContext.authorizationFingerprint;
  const pathname = usePathname() || "/";
  const router = useRouter();
  const liveNotifications = useNotifications();
  const notificationInbox = notificationSnapshot ?? liveNotifications;
  const unreadNotifications = notificationInbox.notifications.filter(
    (notification) => !notification.readAt,
  );
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const storageKey = buildAssistantHistoryKey({
    userId: effectiveUserId,
    role: effectiveRole,
    storeId: effectiveStoreId,
    authorizationFingerprint: effectiveAuthorizationFingerprint,
  });

  const [size, setSize] = useState<{ width?: number; height?: number }>({});
  const isResizing = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScrollLimits = () => {
    const el = scrollContainerRef.current;
    if (el) {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setShowLeftArrow(scrollLeft > 1);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const handleScroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (el) {
      const scrollAmount = 160;
      el.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      checkScrollLimits();
      window.addEventListener("resize", checkScrollLimits);
      el.addEventListener("scroll", checkScrollLimits);

      const observer = new MutationObserver(checkScrollLimits);
      observer.observe(el, { childList: true, subtree: true });

      return () => {
        window.removeEventListener("resize", checkScrollLimits);
        el.removeEventListener("scroll", checkScrollLimits);
        observer.disconnect();
      };
    }
  }, [open]);

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
        const parsed = sanitizeAssistantHistoryRecord(JSON.parse(saved));
        if (parsed && parsed.messages.length > 0) {
          setMessages(parsed.messages);
          return;
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
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setIsStreaming(false);
    setShowClearConfirm(false);
    setMessages([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn("Failed to clear AI chat history", e);
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    return getQuickPromptsForRole(effectiveRole);
  }, [effectiveRole]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(180, textareaRef.current.scrollHeight)}px`;
    }
  };

  const handleTemplateQuestion = (question: string) => {
    setInput(question);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const downloadGeneratedFile = async (action: Extract<AssistantClientAction, { kind: "export_financial_report" | "export_customer_recap" }>) => {
    if (action.kind === "export_financial_report") {
      const { exportFinancialReportFile } = await import("@/features/financial-report/helpers/journal-export");
      return exportFinancialReportFile(action.period, action.format);
    }
    const { exportCustomerRecapPeriod } = await import("@/features/customer-recap/helpers/customer-recap-export-client");
    return exportCustomerRecapPeriod(action.period, action.format);
  };

  const handleGeneratedFileDownload = async (action: Extract<AssistantClientAction, { kind: "export_financial_report" | "export_customer_recap" }>) => {
    try {
      setError(null);
      const result = await downloadGeneratedFile(action);
      setMessages((current) => current.map((message) => {
        const file = message.generatedFile;
        if (!file || file.action.kind !== action.kind || file.action.period !== action.period || file.action.format !== action.format) {
          return message;
        }
        return { ...message, generatedFile: { ...file, advice: result.advice, downloaded: true } };
      }));
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "File belum berhasil diunduh ulang.");
    }
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
        {
          messages: requestMessages,
          pageContext: { page: pathname },
        },
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
        if ("type" in parsed && parsed.type === "client_action") {
          if (parsed.action.kind !== "open_modal") {
            const action = parsed.action;
            const baseName = action.kind === "export_financial_report" ? "laporan-keuangan" : "rekap-pelanggan";
            const fileLabel = action.kind === "export_financial_report" ? "Laporan Keuangan" : "Rekap Pelanggan";
            setMessages((current) => setAssistantGeneratedFile(current, {
              name: `${baseName}-${action.period}.${action.format}`,
              format: action.format,
              label: fileLabel,
              action,
              advice: [],
              downloaded: false,
            }));
            setMessages((current) => appendAssistantActionLogEntry(current, {
              label: "File siap diunduh",
              occurredAt: parsed.occurredAt,
              status: "done",
            }));
            continue;
          }
          flushSync(() => {
            setMessages((current) => appendAssistantActionLogEntry(current, {
              label: "Menjalankan aksi di aplikasi",
              occurredAt: parsed.occurredAt,
              status: "active",
            }));
          });
          try {
            const label = await executeAssistantClientAction(parsed.action, {
              currentPath: pathname,
              dispatchModal: (modal) => {
                window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_MODAL_EVENT, {
                  detail: { modal },
                }));
              },
              navigate: (route) => router.push(route),
              storage: window.sessionStorage,
              exportFinancialReport: async (period, format) => {
                await downloadGeneratedFile({ kind: "export_financial_report", period, format });
              },
              exportCustomerRecap: async (period, format) => {
                await downloadGeneratedFile({ kind: "export_customer_recap", period, format });
              },
            });
            setMessages((current) => appendAssistantActionLogEntry(current, {
              label,
              occurredAt: new Date().toISOString(),
              status: "done",
            }));
          } catch (actionError) {
            const message = actionError instanceof Error
              ? actionError.message
              : "Aksi dari Pak Tel belum berhasil dijalankan.";
            setMessages((current) => appendAssistantActionFailure(
              current,
              "Aksi aplikasi gagal",
              new Date().toISOString(),
            ));
            setError(message);
          }
          continue;
        }
        if ("type" in parsed && parsed.type === "final") {
          setMessages((current) => setAssistantFollowUps(
            completeAssistantActionLog(
              setAssistantWorkflowPayload(
                appendAssistantMetadata(
                  setAssistantFinalContent(current, parsed.answer.answerMarkdown),
                  {
                    sourceLabel: parsed.answer.sourceLabel,
                    generatedAt: parsed.answer.generatedAt,
                    sourceRefs: parsed.answer.sourceRefs,
                  },
                ),
                parsed.answer.workflow,
              ),
            ),
            parsed.answer.followUps ?? [],
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
        ? "Permintaan butuh perbaikan"
        : isAccessDenied
          ? "Akses ditolak"
          : "Respons terputus";
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

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;

    const stopPropagation = (e: Event) => {
      e.stopPropagation();
    };

    el.addEventListener("pointerdown", stopPropagation);
    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("touchstart", stopPropagation);

    return () => {
      el.removeEventListener("pointerdown", stopPropagation);
      el.removeEventListener("mousedown", stopPropagation);
      el.removeEventListener("touchstart", stopPropagation);
    };
  }, [open]);

  return (
    <motion.div
      className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end"
      drag
      dragMomentum={false}
      style={{ touchAction: "none" }}
    >
      <button
        type="button"
        className={`floating-ai-button relative w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 transform hover:scale-105 hover:shadow-[0_0_30px_rgba(12,152,233,0.8),0_0_50px_rgba(0,121,199,0.6)] ${open ? "rotate-90" : "rotate-0"}`}
        onClick={() => {
          if (open) activeRequestRef.current?.abort();
          setOpen((prev) => !prev);
        }}
        aria-label={open ? "Tutup asisten AI" : "Buka asisten AI"}
        style={{
          background: "linear-gradient(135deg, rgba(12, 152, 233, 0.8) 0%, rgba(1, 96, 161, 0.8) 100%)",
          boxShadow: "0 0 20px rgba(12, 152, 233, 0.7), 0 0 40px rgba(0, 121, 199, 0.5), 0 0 60px rgba(1, 96, 161, 0.3)",
          border: "2px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-30"></div>
        <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
        <div className="relative z-10">
          {open ? <X className="w-6 h-6 md:w-8 md:h-8 text-white" /> : <Bot className="w-6 h-6 md:w-8 md:h-8 text-white" />}
        </div>
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-brand-500"></div>
        {notificationInbox.unreadCount > 0 ? (
          <span
            aria-label={`${notificationInbox.unreadCount} notifikasi belum dibaca`}
            className="absolute -right-1.5 -top-1.5 z-20 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ring-2 ring-surface-900"
          >
            {notificationInbox.unreadCount > 99 ? "99+" : notificationInbox.unreadCount}
          </span>
        ) : null}
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
                  {showClearConfirm ? (
                    <>
                      <button
                        onClick={handleClearChat}
                        className="px-2 py-1 text-[10px] font-semibold rounded-md bg-danger-500/20 text-danger-300 hover:bg-danger-500/30 transition-colors"
                      >
                        Hapus
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-2 py-1 text-[10px] font-semibold rounded-md bg-surface-700/50 text-surface-300 hover:bg-surface-600/50 transition-colors"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      title="Hapus riwayat chat"
                      className="p-1.5 rounded-full hover:bg-danger-500/20 hover:text-danger-400 text-surface-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="p-1.5 rounded-full hover:bg-surface-700/50 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4 text-surface-400" />
                  </button>
                </div>
              </div>
            </div>

            {notificationInbox.unreadCount > 0 ? (
              <section
                aria-label="Info notifikasi dari Pak Teladan"
                className="border-b border-red-400/20 bg-red-500/10 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-red-100">Pak Teladan ngabarin</p>
                    <p className="mt-0.5 text-[11px] text-red-200/80">
                      {notificationInbox.unreadCount} notifikasi belum dibaca.
                    </p>
                  </div>
                  <Bell className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                  {unreadNotifications.slice(0, 3).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        void Promise.resolve(notificationInbox.markAsRead(notification.id))
                          .catch(() => undefined)
                          .then(() => {
                            setOpen(false);
                            router.push(notification.url?.startsWith("/") ? notification.url : "/dashboard");
                          });
                      }}
                      className="min-w-[190px] rounded-xl border border-red-300/20 bg-surface-900/45 px-3 py-2 text-left hover:border-red-300/40 hover:bg-surface-900/70"
                    >
                      <span className="block truncate text-[11px] font-bold text-surface-100">
                        {notification.title}
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-[10px] text-surface-300">
                        {notification.body}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

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
                    {message.role === "assistant" && message.workflow ? (
                      <AssistantWorkflowMessage workflow={message.workflow} />
                    ) : null}
                    {message.role === "assistant" && message.generatedFile ? (
                      <div className="mt-3 rounded-xl border border-brand-400/30 bg-brand-500/10 p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 shrink-0 text-brand-300" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-surface-100">{message.generatedFile.label}</p>
                            <p className="truncate text-[10px] text-surface-400">{message.generatedFile.name}</p>
                          </div>
                          <button type="button" onClick={() => void handleGeneratedFileDownload(message.generatedFile!.action)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-brand-500">
                            <Download className="h-3 w-3" aria-hidden="true" /> {message.generatedFile.downloaded === false ? `Download ${message.generatedFile.format.toUpperCase()}` : "Download ulang"}
                          </button>
                        </div>
                        {message.generatedFile.advice.length ? (
                          <div className="mt-3 border-t border-brand-400/20 pt-2">
                            <p className="text-[11px] font-semibold text-brand-200">Saran Pak Teladan</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-surface-200">
                              {message.generatedFile.advice.map((advice) => <li key={advice}>{advice}</li>)}
                            </ul>
                          </div>
                        ) : null}
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
                  {message.role === "assistant" && message.followUps?.length ? (
                    <div className="mt-2 flex max-w-full flex-wrap gap-2">
                      {message.followUps.map((followUp) => (
                        <button
                          key={followUp}
                          type="button"
                          onClick={() => setInput(followUp)}
                          disabled={isStreaming}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-[11px] font-medium text-brand-200 transition-colors duration-200 hover:border-brand-400/60 hover:bg-brand-500/20 focus:outline-none focus:ring-2 focus:ring-brand-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          {followUp}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={2}
                maxLength={maxChars}
                aria-describedby="assistant-character-limit"
                className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-transparent border-none outline-none resize-none text-sm leading-relaxed text-surface-50 placeholder-surface-500 scrollbar-none"
                placeholder="Tanya AI, share ide, atau minta bantuan..."
                style={{ scrollbarWidth: "none", msOverflowStyle: "none", minHeight: "60px" }}
                disabled={isStreaming}
              />
            </div>

            <div className="px-4 pb-4 pt-1 bg-surface-800/50">
              <div className="mb-1.5 flex items-center justify-between gap-3 px-1 text-[10px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-surface-300">
                  <Sparkles className="h-3 w-3 text-brand-400" aria-hidden="true" />
                  Ide cepat buat kamu
                </span>
                <span className="text-surface-500">Klik prompt untuk isi pesan</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                {showLeftArrow && (
                  <button
                    type="button"
                    onClick={() => handleScroll("left")}
                    aria-label="Geser kiri"
                    className="shrink-0 p-1 rounded-full text-surface-400 hover:text-surface-100 hover:bg-surface-700/60 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}

                <div
                  ref={scrollContainerRef}
                  className="-mx-1 flex flex-1 min-w-0 snap-x snap-mandatory flex-nowrap items-center gap-2 overflow-x-auto px-1 py-1 [-webkit-overflow-scrolling:touch] [-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden"
                  aria-label="Prompt cepat"
                >
                  {templateQuestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleTemplateQuestion(q)}
                      disabled={isStreaming}
                      aria-label={`Pakai prompt: ${q}`}
                      title="Isi pesan dengan prompt ini"
                      className={`${isGlowingQuickPrompt(q) ? "assistant-quick-prompt-glow border-brand-400/70 text-brand-100" : "border-surface-700/60 text-surface-300"} snap-start shrink-0 whitespace-nowrap rounded-full border bg-surface-800/80 px-3.5 py-1.5 text-[11px] font-medium shadow-sm transition-all duration-200 hover:border-surface-600 hover:bg-surface-700 hover:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-400/50 disabled:opacity-50`}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {showRightArrow && (
                  <button
                    type="button"
                    onClick={() => handleScroll("right")}
                    aria-label="Geser kanan"
                    className="shrink-0 p-1 rounded-full text-surface-400 hover:text-surface-100 hover:bg-surface-700/60 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}

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
