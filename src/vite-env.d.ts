/// <reference types="vite/client" />

// Minimal typing for the Telegram WebApp global. We don't depend on it — we
// fall back gracefully when not running inside Telegram.
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
        HapticFeedback?: {
          impactOccurred: (
            style: "light" | "medium" | "heavy" | "rigid" | "soft"
          ) => void;
          notificationOccurred: (type: "success" | "warning" | "error") => void;
          selectionChanged: () => void;
        };
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
      };
    };
  }
}

export {};
