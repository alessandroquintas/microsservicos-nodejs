import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectWithRetry } from "../../../src/infra/messaging/connect-with-retry.ts";

const waits: number[] = [];
const sleep = async (ms: number) => {
  waits.push(ms);
};

beforeEach(() => {
  waits.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("connectWithRetry", () => {
  it("connects on the first attempt", async () => {
    const connect = vi.fn().mockResolvedValue("connection");

    const result = await connectWithRetry(connect, { sleep });

    expect(result).toBe("connection");
    expect(connect).toHaveBeenCalledOnce();
    expect(waits).toEqual([]);
  });

  it("connects after two failures, waiting 1000 and 2000 ms", async () => {
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue("connection");

    const result = await connectWithRetry(connect, { sleep });

    expect(result).toBe("connection");
    expect(connect).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("limits the wait to maxDelayMs", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      connectWithRetry(connect, { sleep, maxAttempts: 6, maxDelayMs: 5000 }),
    ).rejects.toThrow();

    expect(waits).toEqual([1000, 2000, 4000, 5000, 5000]);
  });

  it("rethrows the last error after maxAttempts failures", async () => {
    const lastError = new Error("last");
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValueOnce(lastError);

    await expect(
      connectWithRetry(connect, { sleep, maxAttempts: 3 }),
    ).rejects.toBe(lastError);
    expect(connect).toHaveBeenCalledTimes(3);
  });
});
