"use client";

import { useEffect, useState } from "react";
import { registerSW } from "@/app/sw-register";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    registerSW();

    if (localStorage.getItem(DISMISS_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "#1a1a1a",
        color: "#fff",
        border: "1px solid #f59e0b",
        borderRadius: "0.5rem",
        padding: "0.75rem 1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        maxWidth: "calc(100vw - 2rem)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: "0.875rem" }}>Add to Home Screen</span>
      <button
        onClick={handleInstall}
        style={{
          background: "#f59e0b",
          color: "#0a0a0a",
          border: "none",
          borderRadius: "0.25rem",
          padding: "0.375rem 0.75rem",
          fontSize: "0.8rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          color: "#888",
          border: "none",
          cursor: "pointer",
          fontSize: "1rem",
          lineHeight: 1,
          padding: "0.25rem",
        }}
      >
        ✕
      </button>
    </div>
  );
}
