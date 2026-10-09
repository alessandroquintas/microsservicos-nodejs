import { asc, eq, isNull } from "drizzle-orm";
import type { OutboxBatch, OutboxStore } from "@microservices/messaging";
import type { db as database } from "../client.ts";
import { schema } from "../schema/index.ts";

type Database = typeof database;

export class DrizzleOutboxStore implements OutboxStore {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async processPending<T>(
    limit: number,
    handler: (batch: OutboxBatch) => Promise<T>,
  ): Promise<T> {
    return this.#db.transaction(async (tx) => {
      const events = await tx
        .select({
          id: schema.outboxEvents.id,
          type: schema.outboxEvents.type,
          payload: schema.outboxEvents.payload,
          attempts: schema.outboxEvents.attempts,
        })
        .from(schema.outboxEvents)
        .where(isNull(schema.outboxEvents.publishedAt))
        .orderBy(asc(schema.outboxEvents.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });

      return handler({
        events,
        markAsPublished: async (event) => {
          await tx
            .update(schema.outboxEvents)
            .set({
              publishedAt: new Date(),
              attempts: event.attempts + 1,
              lastError: null,
            })
            .where(eq(schema.outboxEvents.id, event.id));
        },
        markAsFailed: async (event, error) => {
          await tx
            .update(schema.outboxEvents)
            .set({ attempts: event.attempts + 1, lastError: error })
            .where(eq(schema.outboxEvents.id, event.id));
        },
      });
    });
  }
}
