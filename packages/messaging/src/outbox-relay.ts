import type { ConfirmChannel } from "amqplib";

export type OutboxEvent = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
};

export type OutboxBatch = {
  events: OutboxEvent[];
  markAsPublished(event: OutboxEvent): Promise<void>;
  markAsFailed(event: OutboxEvent, error: string): Promise<void>;
};

// Porta implementada por cada serviço sobre a própria tabela de outbox. A
// implementação abre a transação, busca até `limit` eventos pendentes com
// FOR UPDATE SKIP LOCKED e entrega o lote ao handler. `markAsPublished` grava
// published_at e incrementa attempts; `markAsFailed` incrementa attempts e grava
// last_error, mantendo o evento pendente.
export interface OutboxStore {
  processPending<T>(
    limit: number,
    handler: (batch: OutboxBatch) => Promise<T>,
  ): Promise<T>;
}

type PublishChannel = Pick<ConfirmChannel, "publish" | "waitForConfirms">;

type OutboxRelayOptions = {
  exchange: string;
  routingKeys: Record<string, string>;
  batchSize?: number;
};

export class OutboxRelay {
  #store: OutboxStore;
  #channel: PublishChannel;
  #exchange: string;
  #routingKeys: Record<string, string>;
  #batchSize: number;
  #timer: NodeJS.Timeout | undefined;
  #running = false;
  #currentTick: Promise<void> | undefined;

  constructor(
    store: OutboxStore,
    channel: PublishChannel,
    options: OutboxRelayOptions,
  ) {
    this.#store = store;
    this.#channel = channel;
    this.#exchange = options.exchange;
    this.#routingKeys = options.routingKeys;
    this.#batchSize = options.batchSize ?? 50;
  }

  async publishPending(): Promise<number> {
    return this.#store.processPending(this.#batchSize, async (batch) => {
      let published = 0;

      for (const event of batch.events) {
        try {
          await this.#publish(event);
          await batch.markAsPublished(event);
          published++;
        } catch (error) {
          await batch.markAsFailed(
            event,
            error instanceof Error ? error.message : String(error),
          );
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
    const routingKey = this.#routingKeys[event.type];

    if (!routingKey) {
      throw new Error(
        `No routing key configured for event type "${event.type}"`,
      );
    }

    this.#channel.publish(
      this.#exchange,
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
