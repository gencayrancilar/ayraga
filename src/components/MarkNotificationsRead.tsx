"use client";

import { useEffect, useRef } from "react";
import { markNotificationsRead } from "@/lib/actions/notifications";

/**
 * Takip ekranı görüntülendiğinde okunmamış bildirimleri işaretler.
 * Görsel çıktısı yoktur; yalnızca yan etkiyi render'ın dışına taşır.
 */
export function MarkNotificationsRead({ hasUnread }: { hasUnread: boolean }) {
  const done = useRef(false);

  useEffect(() => {
    if (!hasUnread || done.current) return;
    done.current = true;
    void markNotificationsRead();
  }, [hasUnread]);

  return null;
}
