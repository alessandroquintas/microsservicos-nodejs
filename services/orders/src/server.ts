import "@opentelemetry/auto-instrumentations-node/register";

import { CreateOrderUseCase } from "./application/use-cases/create-order.ts";
import { DrizzleCustomersRepository } from "./infra/db/repositories/drizzle-customers-repository.ts";
import { db } from "./infra/db/client.ts";
import { buildApp } from "./infra/http/app.ts";
import { DrizzleUnitOfWork } from "./infra/db/drizzle-unit-of-work.ts";

// Adapters de sáida
const customersRepository = new DrizzleCustomersRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);

// Use cases
const createOrder = new CreateOrderUseCase(customersRepository, unitOfWork);

// Adapter de entrada
const app = buildApp({ createOrder });

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) })
  .then(() => {
    console.log("[Orders] HTTP Server running !");
  });
