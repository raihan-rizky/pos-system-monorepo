"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRole } from "@/components/providers/RoleProvider";
import { CHANGELOG } from "../data/changelog";
import { changeKey, getUnseenChanges, parseSeenChanges, seenStorageKey } from "../helpers/changelog";
import type { ChangeEntry } from "../types";
import { WhatsNewDialog } from "./WhatsNewDialog";

export function WhatsNewPopup() {
  const { userId, canAccess } = useRole();
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState<{ userId: string; entries: ChangeEntry[] } | null>(null);
  const memory = useRef<Record<string, string[]>>({});

  useEffect(() => {
    if (!userId || pathname === "/changelog" || !canAccess("/changelog")) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      let seen = memory.current[userId] ?? [];
      try { seen = [...seen, ...parseSeenChanges(localStorage.getItem(seenStorageKey(userId)))]; } catch { /* The current session still remembers dismissals when storage is blocked. */ }
      const entries = getUnseenChanges(CHANGELOG, seen);
      if (!entries.length) return;
      if (document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) {
        timer = setTimeout(check, 1500);
        return;
      }
      setAnnouncement({ userId, entries });
    };
    timer = setTimeout(check, 1500);
    return () => clearTimeout(timer);
  }, [userId, pathname, canAccess]);

  const dismiss = () => {
    if (announcement) {
      const owner = announcement.userId;
      let previous = memory.current[owner] ?? [];
      try { previous = [...previous, ...parseSeenChanges(localStorage.getItem(seenStorageKey(owner)))]; } catch { /* Storage is optional. */ }
      const validKeys = new Set(CHANGELOG.map(changeKey));
      const seen = [...new Set([...previous, ...announcement.entries.map(changeKey)])].filter(key => validKeys.has(key));
      memory.current[owner] = seen;
      try { localStorage.setItem(seenStorageKey(owner), JSON.stringify(seen)); } catch { /* Use the in-memory fallback. */ }
    }
    setAnnouncement(null);
  };

  if (!announcement || announcement.userId !== userId || pathname === "/changelog" || !canAccess("/changelog")) return null;
  return <WhatsNewDialog key={announcement.userId} entries={announcement.entries} canAccess={canAccess} onClose={dismiss} />;
}
