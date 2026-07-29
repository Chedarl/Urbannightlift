/**
 * Keep the screen awake while a delivery is running.
 *
 * This is the fix for the complaint that live tracking "constantly fails". The
 * rider pockets the phone and rides; the screen sleeps; the browser backgrounds
 * the tab; and `watchPosition` stops firing. Nothing in the code was wrong — the
 * platform had simply stopped giving us positions. Holding a screen wake lock
 * for the length of the delivery keeps the page alive and the fixes coming.
 *
 * The lock is dropped automatically by the browser whenever the page is hidden,
 * so it has to be re-taken on `visibilitychange` rather than requested once.
 *
 * Honest limit: this makes tracking reliable while the rider is riding with the
 * phone awake. No web page can read GPS with the screen off — that needs a
 * native app or a tracker on the bike (see docs/TRACKING-OPTIONS.md).
 */

type Sentinel = { released: boolean; release: () => Promise<void> };

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export class ScreenWakeLock {
  private sentinel: Sentinel | null = null;
  private wanted = false;
  private onVisibility: (() => void) | null = null;

  async acquire(): Promise<boolean> {
    this.wanted = true;
    if (!wakeLockSupported()) return false;

    if (!this.onVisibility) {
      // The browser silently releases the lock when the tab is hidden, so it
      // has to be re-taken every time the rider looks at their phone again.
      this.onVisibility = () => {
        if (this.wanted && document.visibilityState === "visible") void this.request();
      };
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    return this.request();
  }

  private async request(): Promise<boolean> {
    try {
      const api = (navigator as unknown as {
        wakeLock: { request: (type: "screen") => Promise<Sentinel> };
      }).wakeLock;
      this.sentinel = await api.request("screen");
      return true;
    } catch {
      // Denied, unsupported, or the page is not visible. Tracking still works
      // while the screen happens to be on, so this is never fatal.
      return false;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    if (this.onVisibility) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.onVisibility = null;
    }
    try {
      await this.sentinel?.release();
    } catch {
      // Already gone.
    }
    this.sentinel = null;
  }

  get held(): boolean {
    return this.sentinel != null && !this.sentinel.released;
  }
}
