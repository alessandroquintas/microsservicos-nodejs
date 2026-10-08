import "@opentelemetry/auto-instrumentations-node/register";

import { CreateOrderUseCase } from "./application/use-cases/create-order.ts";
import { DrizzleCustomersRepository } from "./infra/db/repositories/drizzle-customers-repository.ts";
import { db } from "./infra/db/client.ts";
import { buildApp } from "./infra/http/app.ts";
import { DrizzleUnitOfWork } from "./infra/db/drizzle-unit-of-work.ts";
import { OutboxRelay } from "./infra/messaging/outbox-relay.ts";
import { ordersChannel } from "./infra/messaging/channels/orders.ts";
import {
  broker,
  markBrokerShuttingDown,
} from "./infra/messaging/client.ts";

// Adapters de sáida
const customersRepository = new DrizzleCustomersRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);

// Use cases
const createOrder = new CreateOrderUseCase(customersRepository, unitOfWork);

// Adapter de entrada
const app = buildApp({ createOrder });

const outboxRelay = new OutboxRelay(db, ordersChannel);
outboxRelay.start();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) })
  .then(() => {
    console.log("[Orders] HTTP Server running !");
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Orders] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[Orders] Forced shutdown");
    process.exit(1);
  }, 10_000).unref();

  await app.close();
  await outboxRelay.stop();
  markBrokerShuttingDown();
  await ordersChannel.close();
  await broker.close();
  await db.$client.end();

  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
