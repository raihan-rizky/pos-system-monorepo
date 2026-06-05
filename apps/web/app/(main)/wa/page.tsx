"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  ChevronsRight,
  ImageIcon,
  Loader2,
  MessageCircle,
  Send,
  Settings,
  User,
} from "lucide-react";
import { getLogger } from "@/lib/logger";
import {
  useWaContacts,
  useWaMessages,
  useSendMessage,
  useAutoReplyStatus,
  useToggleAutoReply,
} from "@/hooks/useWaChat";

const log = getLogger("page:main:wa");

const ReactMarkdown = dynamic(() => import("react-markdown"), {
  ssr: false,
  loading: () => (
    <span className="text-xs text-surface-400 italic">Memuat...</span>
  ),
});

function resolveInitialChatId(pathname: string | null) {
  if (!pathname) return null;

  const parts = pathname.split("/").filter(Boolean);
  const waIndex = parts.indexOf("wa");
  const rawSegment =
    waIndex >= 0 ? parts[waIndex + 1] : parts[parts.length - 1];

  if (!rawSegment) return null;

  const decoded = decodeURIComponent(rawSegment.trim());
  const normalized = decoded.startsWith("chat_id=")
    ? decoded.slice("chat_id=".length)
    : decoded;

  if (!normalized) return null;
  if (normalized.includes("@")) return normalized;

  return `${normalized}@c.us`;
}

/* ─────────────────────────────────────────────────────────────────
 * WA Connection Error Popup
 * ───────────────────────────────────────────────────────────────── */
function WaConnectionErrorPopup({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-[90%] overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-[22px] w-[22px] text-white" aria-hidden="true" />
          </div>

          <div>
            <h3 className="text-white font-bold text-lg leading-tight">
              Koneksi WhatsApp Gagal
            </h3>
            <p className="text-white/70 text-xs mt-0.5">
              Tidak dapat terhubung ke server WAHA
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-surface-700 text-sm leading-relaxed">
            Sistem tidak dapat mengambil data WhatsApp. Pastikan integrasi
            WhatsApp (WAHA) sudah dikonfigurasi dengan benar di halaman{" "}
            <strong>Pengaturan</strong>.
          </p>

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-3">
            <AlertTriangle className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-amber-600" aria-hidden="true" />

            <div className="text-xs text-amber-800 leading-relaxed">
              <strong>Checklist konfigurasi:</strong>
              <ul className="mt-1.5 space-y-1 list-disc list-inside">
                <li>Nomor WA Aktif</li>
                <li>Session WhatsApp aktif (QR sudah di-scan)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2.5 rounded-xl border border-surface-200 text-surface-600 text-sm font-semibold hover:bg-surface-50 transition-colors"
          >
            Tutup
          </button>

          <button
            onClick={() => router.push("/settings")}
            className="flex-1 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Buka Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * WahaImage
 * ───────────────────────────────────────────────────────────────── */
const WahaImage = memo(function WahaImage({ mediaId }: { mediaId: string }) {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let objectUrl = "";

    async function loadImage(id: string) {
      try {
        const encodedId = encodeURIComponent(id);
        const response = await fetch(`/api/wa/media/${encodedId}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
      } catch (err) {
        log.error("[WahaImage] Failed to load:", id, err);
        setHasError(true);
      }
    }

    if (mediaId) loadImage(mediaId);

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  if (hasError) {
    return (
      <div className="text-xs text-red-500 p-2 border border-red-200 rounded-lg bg-red-50 flex items-center gap-2 mt-1">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Gagal memuat gambar WA.
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="text-xs text-surface-400 p-2 italic flex items-center gap-2 mt-1">
        <Loader2 className="h-4 w-4 animate-spin text-surface-400" aria-hidden="true" />
        Memuat media...
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt="Attachment"
      loading="lazy"
      className="w-full max-w-[260px] sm:max-w-[300px] md:max-w-[360px] max-h-[300px] object-contain rounded-xl mb-2 border border-black/10 bg-surface-100 mt-1"
    />
  );
});

const AiToggleButton = ({
  isAutoReplyOn,
  isAutoReplyLoading,
  isTogglingAutoReply,
  toggleAutoReply,
}: any) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      toggleAutoReply(!isAutoReplyOn);
    }}
    disabled={isAutoReplyLoading || isTogglingAutoReply}
    className={`h-9 px-3 rounded-full flex items-center gap-2 text-[11px] font-bold transition-all flex-shrink-0 shadow-sm ${isAutoReplyOn
        ? "bg-brand-500 text-white animate-ai-glow"
        : "bg-surface-100 text-surface-400 border border-surface-200"
      } hover:shadow-md disabled:opacity-50`}
    title={isAutoReplyOn ? "Nonaktifkan AI Auto Reply" : "Aktifkan AI Auto Reply"}
  >
    <Bot className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />

    <span className="hidden sm:inline">
      {isAutoReplyOn ? "AI Aktif" : "AI Pasif"}
    </span>
    <span className="sm:hidden">{isAutoReplyOn ? "Aktif" : "Pasif"}</span>
  </button>
);

/* ─────────────────────────────────────────────────────────────────
 * SlideToTakeover
 * ───────────────────────────────────────────────────────────────── */
function SlideToTakeover({
  onSlideComplete,
}: {
  onSlideComplete: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const startXRef = useRef(0);

  const thumbWidth = 56;
  const completionThreshold = 0.85;

  const getMaxDrag = useCallback(() => {
    if (!trackRef.current) return 200;
    return trackRef.current.offsetWidth - thumbWidth - 8;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isCompleted) return;
      e.preventDefault();
      setIsDragging(true);
      startXRef.current = e.clientX - dragX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [dragX, isCompleted]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || isCompleted) return;

      const maxDrag = getMaxDrag();
      const newX = Math.max(0, Math.min(e.clientX - startXRef.current, maxDrag));
      setDragX(newX);
    },
    [isDragging, isCompleted, getMaxDrag]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDragging || isCompleted) return;

    setIsDragging(false);

    const maxDrag = getMaxDrag();
    const progress = dragX / maxDrag;

    if (progress >= completionThreshold) {
      setDragX(maxDrag);
      setIsCompleted(true);
      setTimeout(() => {
        onSlideComplete();
      }, 300);
    } else {
      setDragX(0);
    }
  }, [isDragging, isCompleted, dragX, getMaxDrag, onSlideComplete]);

  const maxDrag = getMaxDrag();
  const progress = maxDrag > 0 ? dragX / maxDrag : 0;

  return (
    <div className="slide-takeover-container animate-slideUp">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="slide-ai-badge">
          <Bot className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          <span>AI sedang aktif merespons</span>
        </div>
      </div>

      <div
        ref={trackRef}
        className={`slide-track ${isCompleted ? "slide-track--completed" : ""} ${isDragging ? "slide-track--dragging" : ""
          }`}
      >
        <div
          className="slide-track-fill"
          style={{ width: `${dragX + thumbWidth / 2}px` }}
        />

        <span className="slide-label" style={{ opacity: 1 - progress * 1.5 }}>
          {isCompleted ? "Mengambil alih..." : "Geser untuk ambil alih chat"}
        </span>

        <div className="slide-chevrons" style={{ opacity: isDragging ? 0 : 0.5 }}>
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          <ChevronRight className="-ml-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          <ChevronRight className="-ml-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </div>

        <div
          className={`slide-thumb ${isCompleted ? "slide-thumb--completed" : ""} ${isDragging ? "slide-thumb--active" : ""
            }`}
          style={{
            transform: `translateX(${dragX}px)`,
            transition: isDragging
              ? "none"
              : "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {isCompleted ? (
            <Check className="h-[22px] w-[22px]" strokeWidth={3} aria-hidden="true" />
          ) : (
            <ChevronsRight className="h-[22px] w-[22px]" strokeWidth={2.5} aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

type MessageBubbleProps = {
  msg: any;
  idx: number;
};

const MessageBubble = memo(function MessageBubble({
  msg,
  idx,
}: MessageBubbleProps) {
  const isAssistant = msg.role === "assistant";

  return (
    <div
      key={msg.id || idx}
      className={`flex flex-col ${isAssistant ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[90%] sm:max-w-[82%] md:max-w-[72%] lg:max-w-[64%] rounded-2xl px-3.5 sm:px-4 py-2.5 shadow-sm text-[14px] sm:text-[14.5px] overflow-hidden break-words ${isAssistant
            ? "bg-brand-500 text-white rounded-tr-sm"
            : "bg-white text-surface-900 rounded-tl-sm border border-surface-100"
          }`}
        style={{ overflowWrap: "anywhere" }}
      >
        {(() => {
          if (!msg.image_url) return null;

          if (msg.image_url.startsWith("waha_fallback:")) {
            return (
              <div className="text-xs text-surface-400 p-2 italic flex items-center gap-1.5 mt-1">
                <ImageIcon className="h-[13px] w-[13px]" aria-hidden="true" />
                Media tidak tersedia
              </div>
            );
          }

          if (msg.image_url.includes("/api/files/")) {
            return <WahaImage mediaId={msg.image_url} />;
          }

          if (
            msg.image_url.startsWith("wa_media:") ||
            msg.image_url.startsWith("waha_media:")
          ) {
            let rawId = msg.image_url.replace(/^(wa_media:|waha_media:)/, "");
            if (rawId.includes("?")) rawId = rawId.split("?")[0];
            return <WahaImage mediaId={rawId} />;
          }

          return (
            <img
              src={msg.image_url}
              alt="Lampiran"
              loading="lazy"
              className="w-full max-w-[260px] sm:max-w-[300px] md:max-w-[360px] max-h-[300px] object-contain rounded-xl mb-2 border border-black/10 bg-surface-100"
            />
          );
        })()}

        <div
          className={`wa-markdown leading-relaxed ${isAssistant ? "wa-markdown--light" : "wa-markdown--dark"
            }`}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="mb-1 last:mb-0 whitespace-pre-wrap">{children}</p>
              ),
              strong: ({ children }) => <strong className="font-bold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              ul: ({ children }) => (
                <ul className="list-disc list-inside ml-1 mb-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside ml-1 mb-1">{children}</ol>
              ),
              li: ({ children }) => <li className="mb-0.5">{children}</li>,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${isAssistant ? "text-blue-100" : "text-brand-600"
                    }`}
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code
                  className={`px-1 py-0.5 rounded text-[13px] font-mono ${isAssistant ? "bg-white/20" : "bg-surface-100"
                    }`}
                >
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre
                  className={`p-2 rounded-lg my-1 overflow-x-auto text-[13px] ${isAssistant
                      ? "bg-white/15"
                      : "bg-surface-50 border border-surface-200"
                    }`}
                >
                  {children}
                </pre>
              ),
              h1: ({ children }) => (
                <p className="font-bold text-base mb-1">{children}</p>
              ),
              h2: ({ children }) => (
                <p className="font-bold text-[15px] mb-1">{children}</p>
              ),
              h3: ({ children }) => <p className="font-bold mb-0.5">{children}</p>,
              blockquote: ({ children }) => (
                <blockquote
                  className={`border-l-2 pl-2 my-1 ${isAssistant
                      ? "border-white/40 text-white/80"
                      : "border-surface-300 text-surface-600"
                    }`}
                >
                  {children}
                </blockquote>
              ),
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>

        <div
          className={`text-[10px] mt-1 font-medium ${isAssistant ? "text-brand-100 text-right" : "text-surface-400 text-left"
            }`}
        >
          {new Date(msg.created_at).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
});

export default function WACoexistencePage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [hasDismissedError, setHasDismissedError] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: contacts = [],
    isLoading: contactsLoading,
    isError: isContactsError,
  } = useWaContacts();

  const { data: messages = [], isLoading: messagesLoading } =
    useWaMessages(selectedChatId);

  const { mutateAsync: sendMessage, isPending: isSending } = useSendMessage();

  const {
    data: isAutoReplyOn,
    isLoading: isAutoReplyLoading,
    isError: isAutoReplyError,
  } = useAutoReplyStatus();

  const { mutateAsync: toggleAutoReply, isPending: isTogglingAutoReply } =
    useToggleAutoReply();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSelectedChatId(resolveInitialChatId(window.location.pathname));
    }
  }, []);

  useEffect(() => {
    if ((isContactsError || isAutoReplyError) && !hasDismissedError) {
      setShowErrorPopup(true);
    }
  }, [isContactsError, isAutoReplyError, hasDismissedError]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChatId) return;

    const content = inputText;
    setInputText("");

    try {
      await sendMessage({ chatId: selectedChatId, content });
      inputRef.current?.focus();
    } catch (error) {
      alert("Gagal mengirim pesan: " + error);
      setInputText(content);
    }
  };

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedChatId),
    [contacts, selectedChatId]
  );

  const visibleMessages = useMemo(() => messages.slice(-80), [messages]);

  return (
    <>
      {showErrorPopup && (
        <WaConnectionErrorPopup
          onDismiss={() => {
            setShowErrorPopup(false);
            setHasDismissedError(true);
          }}
        />
      )}

      <div className="flex-1 flex overflow-hidden min-h-0 h-[100dvh] max-h-[100dvh]">
        <div
          className={`w-full md:w-[350px] lg:w-[380px] flex-shrink-0 flex-col border-r border-surface-200 bg-white ${selectedChatId ? "hidden md:flex" : "flex"
            }`}
        >
          <div className="p-4 bg-surface-50 border-b border-surface-200 flex justify-between items-center">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold text-surface-900 truncate">
                WA Live Chat
              </h2>
              <p className="text-[11px] sm:text-xs text-brand-600 font-bold mt-1 tracking-wider uppercase">
                Bot Takeover Aktif
              </p>
            </div>

            <AiToggleButton
              isAutoReplyOn={isAutoReplyOn}
              isAutoReplyLoading={isAutoReplyLoading}
              isTogglingAutoReply={isTogglingAutoReply}
              toggleAutoReply={toggleAutoReply}
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {contactsLoading ? (
              <div className="p-8 flex justify-center text-sm font-medium text-surface-400">
                Memuat chat...
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-8 flex justify-center text-sm text-surface-400 text-center">
                Belum ada riwayat percakapan dari WA.
              </div>
            ) : (
              <ul className="divide-y divide-surface-100">
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    onClick={() => setSelectedChatId(contact.id)}
                    className={`p-3 sm:p-4 cursor-pointer hover:bg-surface-50 transition-colors ${selectedChatId === contact.id ? "bg-brand-50 hover:bg-brand-50" : ""
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        {contact.picture ? (
                          <img
                            src={contact.picture}
                            alt=""
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border border-surface-200"
                          />
                        ) : (
                          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-surface-200 flex items-center justify-center text-surface-500">
                            <User className="h-6 w-6" aria-hidden="true" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5 gap-2">
                          <h3 className="font-bold text-surface-900 truncate">
                            {contact.name || contact.phone || contact.id}
                          </h3>

                          <span className="text-[11px] font-medium text-surface-400 whitespace-nowrap">
                            {new Date(contact.created_at).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <div className="flex gap-1.5 items-center min-w-0">
                          {contact.role === "assistant" && (
                            <Check className="h-3.5 w-3.5 flex-shrink-0 text-sky-500" strokeWidth={2.5} aria-hidden="true" />
                          )}

                          <p
                            className={`text-sm truncate ${contact.role === "assistant"
                                ? "text-surface-500"
                                : "text-surface-600 font-medium"
                              }`}
                          >
                            {contact.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div
          className={`flex-1 flex-col bg-[#EFEAE2] relative min-w-0 ${!selectedChatId ? "hidden md:flex" : "flex"
            }`}
        >
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage:
                "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxwYXRoIGZpbGw9IiNkMWQ1ZGIiIGQ9Ik0zMC41LDMyLjVsMTkuOS0xOS45YzEuNC0xLjQsMy42LTEuNCw1LDBsMTkuOSwxOS45aDBMNTUuNSw1Mi40YzEuNCwxLjQsMS40LDMuNiwwLDVMMzUuNSw3Ny4zYzEuNCwxLjQsMS40LDMuNiwwLDVMMTUuNiw2Mi40QzE0LjIsNjEuLDE0LjIsNTguOCwxNS42LDU3LjRMMzUuNSwzNy41QzM2LjgsMzYuMiwzNi44LDM0LjEsMzUuNSwzMi41eiIvPjwvc3ZnPg==')",
            }}
          />

          {!selectedChatId ? (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-surface-500 bg-surface-50 px-6 text-center">
              <MessageCircle className="mb-4 h-[60px] w-[60px] opacity-40" strokeWidth={1} aria-hidden="true" />

              <h2 className="text-xl font-bold text-surface-600">Chat WhatsApp POS</h2>
              <p className="mt-2 text-sm text-surface-400 max-w-sm">
                Pilih pelanggan dari daftar di sebelah kiri untuk melihat riwayat
                percakapan dan mengambil alih obrolan bot.
              </p>
            </div>
          ) : (
            <>
              <div className="relative z-20 px-3 md:px-6 py-2.5 md:py-3 bg-white border-b border-surface-200 flex items-center shadow-sm">
                <button
                  onClick={() => setSelectedChatId(null)}
                  className="mr-3 md:hidden p-2 -ml-2 text-surface-500 rounded-full hover:bg-surface-100 transition-colors"
                >
                  <ArrowLeft className="h-6 w-6" aria-hidden="true" />
                </button>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {selectedContact?.picture ? (
                    <img
                      src={selectedContact.picture}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-surface-200 flex items-center justify-center text-surface-500 flex-shrink-0">
                      <User className="h-5 w-5" aria-hidden="true" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-surface-900 leading-tight truncate">
                      {selectedContact?.name || selectedContact?.phone || selectedChatId}
                    </h3>
                    <p className="text-xs text-surface-400 mt-0.5 truncate">
                      {selectedContact?.phone || selectedChatId}
                    </p>
                  </div>
                </div>

                <div className="md:hidden ml-2 flex-shrink-0">
                  <AiToggleButton
                    isAutoReplyOn={isAutoReplyOn}
                    isAutoReplyLoading={isAutoReplyLoading}
                    isTogglingAutoReply={isTogglingAutoReply}
                    toggleAutoReply={toggleAutoReply}
                  />
                </div>
              </div>

              <div className="relative z-10 flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4">
                {messagesLoading ? (
                  <div className="text-center text-surface-500 text-sm p-4 font-medium backdrop-blur-sm bg-white/50 rounded-lg inline-block mx-auto block w-max">
                    Memuat rekapan obrolan...
                  </div>
                ) : (
                  visibleMessages.map((msg, idx) => (
                    <MessageBubble key={msg.id || idx} msg={msg} idx={idx} />
                  ))
                )}

                <div ref={messagesEndRef} className="h-2" />
              </div>

              <div className="relative z-20 border-t border-surface-200 bg-surface-50 px-3 md:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {isAutoReplyOn && selectedChatId ? (
                  <div className="max-w-4xl mx-auto">
                    <SlideToTakeover
                      onSlideComplete={() => {
                        toggleAutoReply(false);
                      }}
                    />
                  </div>
                ) : (
                  <form
                    onSubmit={handleSend}
                    className="flex gap-2.5 max-w-4xl mx-auto animate-fadeIn items-end"
                  >
                    <div className="relative flex-1 min-w-0">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Ketik balasan untuk pelanggan ini..."
                        className="w-full pl-4 sm:pl-5 pr-4 py-3 rounded-full border border-surface-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 shadow-sm transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!inputText.trim() || isSending}
                      className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 hover:shadow-lg disabled:opacity-50 disabled:hover:shadow-md transition-all flex-shrink-0 shadow-md transform active:scale-95"
                    >
                      <Send className="ml-1 h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
