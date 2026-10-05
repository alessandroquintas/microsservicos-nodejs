import "@opentelemetry/auto-instrumentations-node/register";

import { app } from "./http/app.ts";
import "./broker/subscriber.ts";
import { DrizzleInvoicesRepository } from "./db/repositories/drizzle-invoices-repository.ts";
import { db } from "./db/client.ts";
import { CreateInvoiceFromOrderUseCase } from "./application/use-cases/create-invoice-from-order.ts";
import { createOrderCreatedHandler } from "./broker/handlers/order-created.handler.ts";
import { startOrderCreatedConsumer } from "./broker/subscriber.ts";
import { ordersChannel } from "./broker/channels/orders.ts";

// Adapters de saída
const invoicesRepository = new DrizzleInvoicesRepository(db);

// UseCases
const createInvoiceFromOrder = new CreateInvoiceFromOrderUseCase(
  invoicesRepository,
);

// Adapters de entrada
const handleOrderCreated = createOrderCreatedHandler(createInvoiceFromOrder);
await startOrderCreatedConsumer(ordersChannel, handleOrderCreated);

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3334) })
  .then(() => {
    console.log("[Invoices] HTTP Server running !");
  });
