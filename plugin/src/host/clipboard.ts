/**
 * UXP clipboard helpers. Safe no-ops outside InDesign / when API missing.
 */

function getClipboardModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = (globalThis as { require?: (id: string) => unknown }).require;
    if (typeof req === "function") {
      return req("clipboard");
    }
  } catch {
    /* not UXP */
  }
  return null;
}

export async function readClipboardText(): Promise<string> {
  const clip = getClipboardModule();
  if (!clip) return "";
  try {
    if (typeof clip.readText === "function") {
      return String((await clip.readText()) || "").slice(0, 20_000);
    }
    if (typeof clip.getText === "function") {
      return String((await clip.getText()) || "").slice(0, 20_000);
    }
  } catch {
    return "";
  }
  return "";
}

export async function writeClipboardText(text: string): Promise<boolean> {
  const clip = getClipboardModule();
  if (!clip) {
    // Browser / test fallback
    try {
      const nav = globalThis.navigator as { clipboard?: { writeText?: (t: string) => Promise<void> } };
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
  try {
    if (typeof clip.writeText === "function") {
      await clip.writeText(text);
      return true;
    }
    if (typeof clip.setText === "function") {
      await clip.setText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
