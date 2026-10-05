import "@opentelemetry/auto-instrumentations-node/register";

import { buildApp } from "./http/app.ts";
import { DrizzleCustomersRepository } from "./db/repositories/drizzle-customers-repository.ts";
import { db } from "./db/client.ts";
import { DrizzleOrdersRepository } from "./db/repositories/drizzle-orders-repository.ts";
import { RabbitMQOrderEventsPublisher } from "./broker/publisher/rabbitmq-order-events-publisher.ts";
import { ordersChannel } from "./broker/channels/orders.ts";
import { CreateOrderUseCase } from "./application/use-cases/create-order.ts";

// Adapters de sáida
const customersRepository = new DrizzleCustomersRepository(db);
const ordersRepository = new DrizzleOrdersRepository(db);
const orderEventsPublisher = new RabbitMQOrderEventsPublisher(ordersChannel);

// Use cases
const createOrder = new CreateOrderUseCase(
  customersRepository,
  ordersRepository,
  orderEventsPublisher,
);

// Adapter de entrada
const app = buildApp({ createOrder });

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) })
  .then(() => {
    console.log("[Orders] HTTP Server running !");
  });
