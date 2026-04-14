"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
// AppSidebar is provided by layout
import {
  useWaContacts,
  useWaMessages,
  useSendMessage,
  useAutoReplyStatus,
  useToggleAutoReply,
} from "@/hooks/useWaChat";
import { formatDate } from "@/lib/utils";

/**
 * WahaImage — proxies a WAHA media file through our Next.js backend.
 *
 * `mediaId` can be:
 *   - A bare filename:   "AC3D0CE3840F1E65B92C7A6A32D883F3.jpeg"
 *   - A full WAHA URL:  "http://localhost:3000/api/files/default/AC3D...jpeg"
 *
 * In both cases we hit /api/wa/media/[encoded-id] which adds the X-Api-Key
 * and streams the binary back — no CORS, no credentials exposed to the browser.
 */
const WahaImage = ({ mediaId }: { mediaId: string }) => {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let objectUrl = "";

    async function loadImage(id: string) {
      try {
        // Always route through our secure proxy — it handles both bare filename
        // and full URL (encoded) and injects the WAHA X-Api-Key server-side.
        const encodedId = encodeURIComponent(id);
        const response = await fetch(`/api/wa/media/${encodedId}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
      } catch (err) {
        console.error("[WahaImage] Failed to load:", id, err);
        setHasError(true);
      }
    }

    if (mediaId) loadImage(mediaId);

    return () => {
      // Release blob URL on unmount to avoid memory leaks
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  if (hasError)
    return (
      <div className="text-xs text-red-500 p-2 border border-red-200 rounded-lg bg-red-50 flex items-center gap-2 mt-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Gagal memuat gambar WA.
      </div>
    );

  if (!imageSrc)
    return (
      <div className="text-xs text-surface-400 p-2 italic flex items-center gap-2 mt-1">
        <svg className="animate-spin h-4 w-4 text-surface-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading media...
      </div>
    );

  return (
    <img
      src={imageSrc}
      alt="Attachment"
      loading="lazy"
      className="max-w-full max-h-[300px] object-contain rounded-xl mb-2 border border-black/10 bg-surface-100 mt-1"
    />
  );
};

export default function WACoexistencePage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: contacts = [], isLoading: contactsLoading } = useWaContacts();
  const { data: messages = [], isLoading: messagesLoading } =
    useWaMessages(selectedChatId);
  const { mutateAsync: sendMessage, isPending: isSending } = useSendMessage();

  const { data: isAutoReplyOn, isLoading: isAutoReplyLoading } = useAutoReplyStatus();
  const { mutateAsync: toggleAutoReply, isPending: isTogglingAutoReply } = useToggleAutoReply();

  useEffect(() => {
    // Scroll to bottom when messages finish loading or new message arrives
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (contacts && contacts.length > 0) {
      console.group("🔍 WAHA Contacts Debugger");
      contacts.forEach((contact, index) => {
        console.log(`[Contact ${index + 1}]`, {
          ID: contact.id,
          Name: contact.name || "❌ Kosong (null/undefined)",
          Phone: contact.phone || "❌ Kosong",
          HasPicture: contact.picture ? "✅ Ada URL" : "❌ Tidak Ada (null)",
          RawPictureUrl: contact.picture,
        });
      });
      console.groupEnd();
    }
  }, [contacts]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChatId) return;

    const content = inputText;
    setInputText("");
    try {
      await sendMessage({ chatId: selectedChatId, content });
    } catch (error) {
      alert("Gagal mengirim pesan: " + error);
      setInputText(content); // restore input on failure
    }
  };

  const selectedContact = contacts.find((c) => c.id === selectedChatId);

  return (
    <>
      {/* WA Wrapper */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - Contacts List */}
        <div
          className={`w-full md:w-[350px] flex-shrink-0 flex-col border-r border-surface-200 ${selectedChatId ? "hidden md:flex" : "flex"}`}
        >
          <div className="p-4 bg-surface-50 border-b border-surface-200">
            <h2 className="text-xl font-extrabold text-surface-900">
              WA Live Chat
            </h2>
            <p className="text-xs text-brand-600 font-bold mt-1 tracking-wider uppercase">
              Bot Takeover Active
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {contactsLoading ? (
              <div className="p-8 flex justify-center text-sm font-medium text-surface-400">
                Loading chats...
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-8 flex justify-center text-sm text-surface-400">
                Belum ada riwayat percakapan dari WA.
              </div>
            ) : (
              <ul className="divide-y divide-surface-100">
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    onClick={() => setSelectedChatId(contact.id)}
                    className={`p-4 cursor-pointer hover:bg-surface-50 transition-colors ${selectedChatId === contact.id ? "bg-brand-50 hover:bg-brand-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      {" "}
                      {/* Tambahin wrapper flex buat foto & info */}
                      {/* FOTO PROFIL KONTAK */}
                      <div className="relative flex-shrink-0">
                        {contact.picture ? (
                          <img
                            src={contact.picture}
                            alt=""
                            className="w-12 h-12 rounded-full object-cover border border-surface-200"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-surface-200 flex items-center justify-center text-surface-500">
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* NAMA & INFO PESAN */}
                      <div className="flex-1 min-w-0">
                        {" "}
                        {/* min-w-0 penting biar truncate jalan */}
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h3 className="font-bold text-surface-900 truncate">
                            {/* Prioritas: Nama Kontak -> Phone -> ID */}
                            {contact.name || contact.phone || contact.id}
                          </h3>
                          <span className="text-[11px] font-medium text-surface-400 whitespace-nowrap ml-2">
                            {new Date(contact.created_at).toLocaleTimeString(
                              "id-ID",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          {contact.role === "assistant" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#0c98e9"
                              strokeWidth="2.5"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                          <p
                            className={`text-sm truncate ${contact.role === "assistant" ? "text-surface-500" : "text-surface-600 font-medium"}`}
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

        {/* Right Pane - Chat Window */}
        <div
          className={`flex-1 flex-col bg-[#EFEAE2] relative ${!selectedChatId ? "hidden md:flex" : "flex"}`}
        >
          {/* Subtle WA Background Pattern using CSS */}
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage:
                "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxwYXRoIGZpbGw9IiNkMWQ1ZGIiIGQ9Ik0zMC41LDMyLjVsMTkuOS0xOS45YzEuNC0xLjQsMy42LTEuNCw1LDBsMTkuOSwxOS45aDBMNTUuNSw1Mi40YzEuNCwxLjQsMS40LDMuNiwwLDVMMzUuNSw3Ny4zYzEuNCwxLjQsMS40LDMuNiwwLDVMMTUuNiw2Mi40QzE0LjIsNjEuLDE0LjIsNTguOCwxNS42LDU3LjRMMzUuNSwzNy41QzM2LjgsMzYuMiwzNi44LDM0LjEsMzUuNSwzMi41eiIvPjwvc3ZnPg==')",
            }}
          />

          {!selectedChatId ? (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-surface-500 bg-surface-50">
              <svg
                width="60"
                height="60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="mb-4 opacity-40"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <h2 className="text-xl font-bold text-surface-600">
                POS WhatsApp Coexistence
              </h2>
              <p className="mt-2 text-sm text-surface-400 text-center max-w-sm">
                Pilih pelanggan dari daftar di sebelah kiri untuk melihat
                riwayat percakapan dan mengambil alih obrolan bot.
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="relative z-20 px-4 md:px-6 py-3 bg-white border-b border-surface-200 flex items-center shadow-sm">
                <button
                  onClick={() => setSelectedChatId(null)}
                  className="mr-3 md:hidden p-2 -ml-2 text-surface-500 rounded-full hover:bg-surface-100 transition-colors"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                </button>
                <div className="flex items-center gap-3 flex-1">
                  {selectedContact?.picture ? (
                    <img
                      src={selectedContact.picture}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-surface-200 flex items-center justify-center text-surface-500 flex-shrink-0">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-surface-900 leading-tight truncate">
                      {selectedContact?.name ||
                        selectedContact?.phone ||
                        selectedChatId}
                    </h3>
                    <p className="text-xs text-surface-400 mt-0.5 truncate">
                      {selectedContact?.phone || selectedChatId}
                    </p>
                  </div>
                </div>

                {/* AI Toggle in Header */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAutoReply(!isAutoReplyOn);
                  }}
                  disabled={isAutoReplyLoading || isTogglingAutoReply}
                  className={`h-9 px-3 rounded-full flex items-center gap-2 text-[11px] font-bold transition-all flex-shrink-0 shadow-sm ${
                    isAutoReplyOn
                      ? "bg-brand-500 text-white animate-ai-glow"
                      : "bg-surface-100 text-surface-400 border border-surface-200"
                  } hover:shadow-md disabled:opacity-50`}
                  title={isAutoReplyOn ? "Nonaktifkan AI Auto Reply" : "Aktifkan AI Auto Reply"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4" />
                    <line x1="8" y1="16" x2="8.01" y2="16" />
                    <line x1="16" y1="16" x2="16.01" y2="16" />
                  </svg>
                  <span className="hidden sm:inline">
                    {isAutoReplyOn ? "AI Aktif" : "AI Pasif"}
                  </span>
                  <span className="sm:hidden">
                    {isAutoReplyOn ? "Aktif" : "Pasif"}
                  </span>
                </button>
              </div>

              {/* Messages Area */}
              <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4">
                {messagesLoading ? (
                  <div className="text-center text-surface-500 text-sm p-4 font-medium backdrop-blur-sm bg-white/50 rounded-lg inline-block mx-auto mx-auto block w-max">
                    Memuat rekapan obrolan...
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    console.log(msg);

                    const isAssistant = msg.role === "assistant";
                    return (
                      <div
                        key={msg.id || idx}
                        className={`flex flex-col ${isAssistant ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm text-[14.5px] overflow-hidden break-words ${
                            isAssistant
                              ? "bg-brand-500 text-white rounded-tr-sm"
                              : "bg-white text-surface-900 rounded-tl-sm border border-surface-100"
                          }`}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {(() => {
                            if (!msg.image_url) return null;

                            // ── waha_fallback: scheme ─────────────────────
                            // hasMedia was true but WAHA didn't return a URL
                            // (e.g. media expired or not yet downloaded).
                            if (msg.image_url.startsWith("waha_fallback:")) {
                              return (
                                <div className="text-xs text-surface-400 p-2 italic flex items-center gap-1.5 mt-1">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                  Media tidak tersedia
                                </div>
                              );
                            }

                            // ── Full WAHA file URL ───────────────────────
                            // e.g. "http://localhost:3000/api/files/default/XYZ.jpeg"
                            // Pass the full URL to WahaImage; our proxy handles it.
                            if (msg.image_url.includes("/api/files/")) {
                              return <WahaImage mediaId={msg.image_url} />;
                            }

                            // ── Legacy waha_media: / wa_media: schemes ───
                            if (
                              msg.image_url.startsWith("wa_media:") ||
                              msg.image_url.startsWith("waha_media:")
                            ) {
                              let rawId = msg.image_url.replace(
                                /^(wa_media:|waha_media:)/,
                                "",
                              );
                              // Strip trailing query params
                              if (rawId.includes("?")) rawId = rawId.split("?")[0];
                              return <WahaImage mediaId={rawId} />;
                            }

                            // ── Plain external URL fallback ───────────────
                            return (
                              <img
                                src={msg.image_url}
                                alt="Attachment"
                                loading="lazy"
                                className="max-w-full max-h-[300px] object-contain rounded-xl mb-2 border border-black/10 bg-surface-100"
                              />
                            );
                          })()}
                          <div
                            className={`wa-markdown leading-relaxed ${
                              isAssistant
                                ? "wa-markdown--light"
                                : "wa-markdown--dark"
                            }`}
                          >
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => (
                                  <p className="mb-1 last:mb-0 whitespace-pre-wrap">
                                    {children}
                                  </p>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-bold">
                                    {children}
                                  </strong>
                                ),
                                em: ({ children }) => (
                                  <em className="italic">{children}</em>
                                ),
                                ul: ({ children }) => (
                                  <ul className="list-disc list-inside ml-1 mb-1">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="list-decimal list-inside ml-1 mb-1">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="mb-0.5">{children}</li>
                                ),
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`underline ${isAssistant ? "text-blue-100" : "text-brand-600"}`}
                                  >
                                    {children}
                                  </a>
                                ),
                                code: ({ children }) => (
                                  <code
                                    className={`px-1 py-0.5 rounded text-[13px] font-mono ${isAssistant ? "bg-white/20" : "bg-surface-100"}`}
                                  >
                                    {children}
                                  </code>
                                ),
                                pre: ({ children }) => (
                                  <pre
                                    className={`p-2 rounded-lg my-1 overflow-x-auto text-[13px] ${isAssistant ? "bg-white/15" : "bg-surface-50 border border-surface-200"}`}
                                  >
                                    {children}
                                  </pre>
                                ),
                                h1: ({ children }) => (
                                  <p className="font-bold text-base mb-1">
                                    {children}
                                  </p>
                                ),
                                h2: ({ children }) => (
                                  <p className="font-bold text-[15px] mb-1">
                                    {children}
                                  </p>
                                ),
                                h3: ({ children }) => (
                                  <p className="font-bold mb-0.5">{children}</p>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote
                                    className={`border-l-2 pl-2 my-1 ${isAssistant ? "border-white/40 text-white/80" : "border-surface-300 text-surface-600"}`}
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
                            className={`text-[10px] mt-1 font-medium ${isAssistant ? "text-brand-100 text-right" : "text-surface-400 text-left"}`}
                          >
                            {new Date(msg.created_at).toLocaleTimeString(
                              "id-ID",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} className="h-2" />
              </div>

              {/* Message Input Area */}
              <div className="relative z-20 p-3 md:p-4 bg-surface-50 border-t border-surface-200">
                <form
                  onSubmit={handleSend}
                  className="flex gap-2.5 max-w-4xl mx-auto"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Ketik balasan untuk pelanggan ini..."
                      className="w-full pl-5 pr-12 py-3.5 rounded-full border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 shadow-sm transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isSending}
                    className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 hover:shadow-lg disabled:opacity-50 disabled:hover:shadow-md transition-all flex-shrink-0 shadow-md transform active:scale-95"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-1"
                    >
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
