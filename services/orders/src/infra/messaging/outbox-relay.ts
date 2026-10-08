import type { ConfirmChannel } from "amqplib";
import type { db as database } from "../db/client.ts";
import { schema } from "../db/schema/index.ts";
import { ORDER_CREATED_EVENT } from "@microservices/contracts";
import { asc, eq, isNull } from "drizzle-orm";

type Database = typeof database;
type PublishChannel = Pick<ConfirmChannel, "sendToQueue" | "waitForConfirms">;
type OutboxEvent = typeof schema.outboxEvents.$inferSelect;

const QUEUE_BY_EVENT_TYPE: Record<string, string> = {
  [ORDER_CREATED_EVENT]: "orders-queue",
};

export class OutboxRelay {
  #db: Database;
  #channel: PublishChannel;
  #batchSize: number;
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(
    db: Database,
    channel: PublishChannel,
    options: { batchSize?: number } = {},
  ) {
    this.#db = db;
    this.#channel = channel;
    this.#batchSize = options.batchSize ?? 50;
  }

  async publishPending(): Promise<number> {
    return this.#db.transaction(async (tx) => {
      const events = await tx
        .select()
        .from(schema.outboxEvents)
        .where(isNull(schema.outboxEvents.publishedAt))
        .orderBy(asc(schema.outboxEvents.createdAt))
        .limit(this.#batchSize)
        .for("update", { skipLocked: true });

      let published = 0;

      for (const event of events) {
        try {
          await this.#publish(event);

          await tx
            .update(schema.outboxEvents)
            .set({
              publishedAt: new Date(),
              attempts: event.attempts + 1,
              lastError: null,
            })
            .where(eq(schema.outboxEvents.id, event.id));

          published++;
        } catch (error) {
          await tx
            .update(schema.outboxEvents)
            .set({
              attempts: event.attempts + 1,
              lastError: error instanceof Error ? error.message : String(error),
            })
            .where(eq(schema.outboxEvents.id, event.id));
        }
      }

      return published;
    });
  }

  start(intervalMs = 1000): void {
    this.#running = true;

    const tick = async () => {
      if (!this.#running) return;

      try {
        await this.publishPending();
      } catch (error) {
        console.error("Outbox relay failed", error);
      }

      if (this.#running) {
        this.#timer = setTimeout(tick, intervalMs);
      }
    };

    void tick();
  }

  stop(): void {
    this.#running = false;
    clearTimeout(this.#timer);
  }

  async #publish(event: OutboxEvent): Promise<void> {
    const queue = QUEUE_BY_EVENT_TYPE[event.type];

    if (!queue) {
      throw new Error(`No queue configured for event type "${event.type}"`);
    }

    this.#channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify({ data: event.payload })),
      {
        persistent: true,
        messageId: event.id,
      },
    );

    await this.#channel.waitForConfirms();
  }
}
