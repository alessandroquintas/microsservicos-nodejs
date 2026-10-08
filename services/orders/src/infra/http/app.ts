import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { CreateOrderUseCase } from "../../application/use-cases/create-order.ts";
import { CustomerNotFoundError } from "../../domain/customer/errors.ts";
import { DEFAULT_CUSTOMER_ID } from "../db/default-customer.ts";

type AppDependencies = {
  createOrder: Pick<CreateOrderUseCase, "execute">;
};

function getStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 500;
}

export function buildApp({ createOrder }: AppDependencies) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();

  app.setSerializerCompiler(serializerCompiler);
  app.setValidatorCompiler(validatorCompiler);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = getStatusCode(error);

    if (statusCode < 500) {
      const message = error instanceof Error ? error.message : "Bad request";
      return reply.status(statusCode).send({ message });
    }

    console.error("Unhandled error", {
      method: request.method,
      url: request.url,
      error,
    });

    return reply.status(500).send({ message: "Internal server error" });
  });

  app.register(fastifyCors, { origin: "*" });

  app.get("/health", () => {
    return "Ok";
  });

  app.post(
    "/orders",
    {
      schema: {
        body: z.object({
          amount: z.coerce.number().int().positive(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { amount } = request.body;

        const order = await createOrder.execute({
          customerId: DEFAULT_CUSTOMER_ID,
          amountInCents: amount,
        });

        trace.getActiveSpan()?.setAttribute("order_id", order.id);

        return reply.status(201).send({ orderId: order.id });
      } catch (error) {
        if (error instanceof CustomerNotFoundError) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  return app;
}
