type ConnectWithRetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectWithRetry<T>(
  connect: () => Promise<T>,
  options: ConnectWithRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 10;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;

  let delayMs = options.initialDelayMs ?? 1000;

  for (let attempt = 1; ; attempt++) {
    try {
      return await connect();
    } catch (error) {
      if (attempt >= maxAttempts) throw error;

      const waitMs = Math.min(delayMs, maxDelayMs);

      console.warn(
        `Connection attempt ${attempt}/${maxAttempts} failed, retrying in ${waitMs}ms`,
        error instanceof Error ? error.message : error,
      );

      await sleep(waitMs);
      delayMs *= 2;
    }
  }
}
