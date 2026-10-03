import type { ConsumeMessage } from "amqplib";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/client.ts";
import { schema } from "../src/db/schema/index.ts";
import { handleOrderCreated } from "../src/broker/handlers/order-created.handler.ts";
import { randomUUID } from "node:crypto";
import type { OrderCreatedMessage } from "@microservices/contracts";

function makeMessage(content: string) {
  return { content: Buffer.from(content) } as unknown as ConsumeMessage;
}

function validMessage(): OrderCreatedMessage {
  return {
    orderId: randomUUID(),
    amount: 100,
    customer: {
      id: randomUUID(),
      name: "John Doe",
      email: "johndoe@example.com",
    },
  };
}

const channel = { ack: vi.fn(), nack: vi.fn() };

beforeEach(async () => {
  vi.restoreAllMocks();
  channel.ack.mockClear();
  channel.nack.mockClear();
  await db.delete(schema.invoices);
});

afterAll(async () => {
  await db.$client.end();
});

describe("handleOrderCreated", () => {
  it("creates an invoice and acks the message", async () => {
    const data = validMessage();
    const message = makeMessage(JSON.stringify({ data }));

    await handleOrderCreated(message, channel);

    const invoices = await db.select().from(schema.invoices);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].orderId).toBe(data.orderId);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("nacks without requeue when orderId is missing", async () => {
    const message = makeMessage(JSON.stringify({ data: {} }));

    await handleOrderCreated(message, channel);

    expect(await db.select().from(schema.invoices)).toHaveLength(0);
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it("nacks without requeue when the message is not valid JSON", async () => {
    const message = makeMessage("not-json");

    await handleOrderCreated(message, channel);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it("nacks without requeue when the database fails", async () => {
    vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("database is down");
    });
    const message = makeMessage(
      JSON.stringify({ data: { orderId: "order-1" } }),
    );

    await handleOrderCreated(message, channel);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
