export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}超时（>${Math.round(ms / 1000)}s）`);
    this.name = "TimeoutError";
  }
}

/** Race a promise against a wall-clock timeout. Works even when AbortController is ignored (UXP). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
