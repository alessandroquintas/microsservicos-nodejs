import type { ConfirmChannel } from "amqplib";
import type { db as database } from "../db/client.ts";
import { schema } from "../db/schema/index.ts";
import {
  EVENTS_EXCHANGE,
  ORDER_CREATED_EVENT,
  ORDER_CREATED_ROUTING_KEY,
} from "@microservices/contracts";
import { asc, eq, isNull } from "drizzle-orm";

type Database = typeof database;
type PublishChannel = Pick<ConfirmChannel, "publish" | "waitForConfirms">;
type OutboxEvent = typeof schema.outboxEvents.$inferSelect;

const ROUTING_KEY_BY_EVENT_TYPE: Record<string, string> = {
  [ORDER_CREATED_EVENT]: ORDER_CREATED_ROUTING_KEY,
};

export class OutboxRelay {
  #db: Database;
  #channel: PublishChannel;
  #batchSize: number;
  #timer: NodeJS.Timeout | undefined;
  #running = false;
  #currentTick: Promise<void> | undefined;

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
        this.#timer = setTimeout(() => {
          this.#currentTick = tick();
        }, intervalMs);
      }
    };

    this.#currentTick = tick();
  }

  async stop(): Promise<void> {
    this.#running = false;
    clearTimeout(this.#timer);
    await this.#currentTick;
  }

  async #publish(event: OutboxEvent): Promise<void> {
    const routingKey = ROUTING_KEY_BY_EVENT_TYPE[event.type];

    if (!routingKey) {
      throw new Error(
        `No routing key configured for event type "${event.type}"`,
      );
    }

    this.#channel.publish(
      EVENTS_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify({ data: event.payload })),
      {
        persistent: true,
        messageId: event.id,
      },
    );

    await this.#channel.waitForConfirms();
  }
}
