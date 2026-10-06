import "@opentelemetry/auto-instrumentations-node/register";

import "./infra/messaging/subscriber.ts";

import { buildApp } from "./infra/http/app.ts";
import { CreateInvoiceFromOrderUseCase } from "./application/use-cases/create-invoice-from-order.ts";
import { DrizzleInvoicesRepository } from "./infra/db/repositories/drizzle-invoices-repository.ts";
import { db } from "./infra/db/client.ts";
import { startOrderCreatedConsumer } from "./infra/messaging/subscriber.ts";
import { ordersChannel } from "./infra/messaging/channels/orders.ts";
import { createOrderCreatedHandler } from "./infra/messaging/handlers/order-created.handler.ts";
// Adapters de saída
const invoicesRepository = new DrizzleInvoicesRepository(db);

// UseCases
const createInvoiceFromOrder = new CreateInvoiceFromOrderUseCase(
  invoicesRepository,
);

// Adapters de entrada
const handleOrderCreated = createOrderCreatedHandler(createInvoiceFromOrder);
await startOrderCreatedConsumer(ordersChannel, handleOrderCreated);

const app = buildApp();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3334) })
  .then(() => {
    console.log("[Invoices] HTTP Server running !");
  });
