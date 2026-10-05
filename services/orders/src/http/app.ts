import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { CreateOrderUseCase } from "../application/use-cases/create-order.ts";
import { CustomerNotFoundError } from "../domain/customer/errors.ts";

// Temporário: até a feature de customers, todo pedido usa este customer.
const DEFAULT_CUSTOMER_ID = "5961a952-0d3e-465f-b635-4b93a1cefa97";

type AppDependencies = {
  createOrder: Pick<CreateOrderUseCase, "execute">;
};

export function buildApp({ createOrder }: AppDependencies) {
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
