// Thin wrapper around the Telegram WebApp SDK with graceful fallback for
// local browser dev. Everything is best-effort — never throw if we're not
// running inside Telegram.

export interface TelegramUser {
  id: number;
  firstName?: string;
  username?: string;
  photoUrl?: string;
}

let initialised = false;
let initAttempts = 0;

export function initTelegram(): void {
  if (initialised) return;
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    // Outside Telegram (regular browser dev) this will stop quickly. If the
    // async SDK appears a bit later, the next attempt will initialise it.
    if (initAttempts < 20) {
      initAttempts += 1;
      window.setTimeout(initTelegram, 100);
    }
    return;
  }
  initialised = true;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#0F0F1A");
    tg.setBackgroundColor?.("#0F0F1A");
  } catch {
    // Old Telegram clients may not implement every method — ignore.
  }
}

export function getTelegramUser(): TelegramUser | null {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.first_name,
    username: u.username,
    photoUrl: u.photo_url,
  };
}

export function haptic(
  kind: "light" | "medium" | "heavy" | "success" | "error" = "light"
): void {
  const hf = window.Telegram?.WebApp?.HapticFeedback;
  if (!hf) return;
  try {
    if (kind === "success" || kind === "error") {
      hf.notificationOccurred(kind);
    } else {
      hf.impactOccurred(kind);
    }
  } catch {
    // ignore
  }
}

export function isInTelegram(): boolean {
  return Boolean(window.Telegram?.WebApp);
}
