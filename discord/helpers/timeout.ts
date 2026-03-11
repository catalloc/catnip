/**
 * discord/helpers/timeout.ts
 *
 * Shared timeout wrapper used by cron jobs.
 */

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
