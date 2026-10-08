import "@opentelemetry/auto-instrumentations-node/register";

import { buildApp } from "./infra/http/app.ts";
import { CreateInvoiceFromOrderUseCase } from "./application/use-cases/create-invoice-from-order.ts";
import { DrizzleInvoicesRepository } from "./infra/db/repositories/drizzle-invoices-repository.ts";
import { db } from "./infra/db/client.ts";
import { startConsumer } from "./infra/messaging/consumer.ts";
import {
  ORDER_CREATED_DLQ,
  ORDER_CREATED_QUEUE,
} from "./infra/messaging/topology.ts";
import { ordersChannel } from "./infra/messaging/channels/orders.ts";
import {
  broker,
  markBrokerShuttingDown,
} from "./infra/messaging/client.ts";
import { createOrderCreatedHandler } from "./infra/messaging/handlers/order-created.handler.ts";
// Adapters de saída
const invoicesRepository = new DrizzleInvoicesRepository(db);

// UseCases
const createInvoiceFromOrder = new CreateInvoiceFromOrderUseCase(
  invoicesRepository,
);

// Adapters de entrada
const handleOrderCreated = createOrderCreatedHandler(createInvoiceFromOrder);
const consumer = await startConsumer(
  ordersChannel,
  {
    queue: ORDER_CREATED_QUEUE,
    deadLetterQueue: ORDER_CREATED_DLQ,
    maxRetries: 3,
  },
  handleOrderCreated,
);

const app = buildApp();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3334) })
  .then(() => {
    console.log("[Invoices] HTTP Server running !");
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Invoices] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[Invoices] Forced shutdown");
    process.exit(1);
  }, 10_000).unref();

  await consumer.stop();
  await app.close();
  markBrokerShuttingDown();
  await ordersChannel.close();
  await broker.close();
  await db.$client.end();

  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
