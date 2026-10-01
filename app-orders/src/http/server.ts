import "@opentelemetry/auto-instrumentations-node/register";

import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { db } from "../db/client.ts";
import { schema } from "../db/schema/index.ts";
import { dispatchOrderCreated } from "../broker/messages/order-created.ts";

const app = fastify().withTypeProvider<ZodTypeProvider>();

app.setSerializerCompiler(serializerCompiler);
app.setValidatorCompiler(validatorCompiler);

app.register(fastifyCors, { origin: "*" });

app.get("/health", () => {
  return "Ok";
});

app.post(
  "/orders",
  {
    schema: {
      body: z.object({
        amount: z.coerce.number(),
      }),
    },
  },
  async (request, reply) => {
    const { amount } = request.body;

    console.log("Creating an order with amount", amount);
    const orderId = randomUUID();

    await db.insert(schema.orders).values({
      id: orderId,
      customerId: "5961a952-0d3e-465f-b635-4b93a1cefa97",
      amount,
      status: "pending",
    });

    trace.getActiveSpan()?.setAttribute("order_id", orderId);

    await dispatchOrderCreated({
      orderId,
      amount,
      customer: {
        id: "5961a952-0d3e-465f-b635-4b93a1cefa97",
        name: "John Doe",
        email: "johndoe@example.com",
      },
    });

    return reply.status(201).send();
  },
);

app.listen({ host: "0.0.0.0", port: 3333 }).then(() => {
  console.log("[Orders] HTTP Server running !");
});
