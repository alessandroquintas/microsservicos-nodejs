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
import type { CreateCustomerUseCase } from "../../application/use-cases/create-customer.ts";
import type { GetCustomerUseCase } from "../../application/use-cases/get-customer.ts";
import type { GetOrderUseCase } from "../../application/use-cases/get-order.ts";
import type { ListOrdersUseCase } from "../../application/use-cases/list-orders.ts";
import type { CancelOrderUseCase } from "../../application/use-cases/cancel-order.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../domain/order/errors.ts";
import { OrderStatus } from "../../domain/order/order-entity.ts";
import {
  CustomerAlreadyExistsError,
  CustomerNotFoundError,
  EmptyCustomerFieldError,
  InvalidCustomerDateOfBirthError,
  InvalidCustomerEmailError,
} from "../../domain/customer/errors.ts";

type AppDependencies = {
  createOrder: Pick<CreateOrderUseCase, "execute">;
  createCustomer: Pick<CreateCustomerUseCase, "execute">;
  getCustomer: Pick<GetCustomerUseCase, "execute">;
  getOrder: Pick<GetOrderUseCase, "execute">;
  listOrders: Pick<ListOrdersUseCase, "execute">;
  cancelOrder: Pick<CancelOrderUseCase, "execute">;
};

const DEFAULT_CANCEL_REASON = "Canceled by customer";

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

function isInvalidCustomerDataError(error: unknown): error is Error {
  return (
    error instanceof EmptyCustomerFieldError ||
    error instanceof InvalidCustomerEmailError ||
    error instanceof InvalidCustomerDateOfBirthError
  );
}

export function buildApp({
  createOrder,
  createCustomer,
  getCustomer,
  getOrder,
  listOrders,
  cancelOrder,
}: AppDependencies) {
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
    "/customers",
    {
      schema: {
        body: z.object({
          name: z.string(),
          email: z.email(),
          address: z.string(),
          state: z.string(),
          zipCode: z.string(),
          country: z.string(),
          dateOfBirth: z.iso.date().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { dateOfBirth, ...data } = request.body;

        const customer = await createCustomer.execute({
          ...data,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        });

        return reply.status(201).send({ customerId: customer.id });
      } catch (error) {
        if (error instanceof CustomerAlreadyExistsError) {
          return reply.status(409).send({ message: error.message });
        }
        if (isInvalidCustomerDataError(error)) {
          return reply.status(400).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/customers/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      try {
        const customer = await getCustomer.execute({
          customerId: request.params.id,
        });

        return reply.status(200).send({
          id: customer.id,
          name: customer.name,
          email: customer.email,
          address: customer.address,
          state: customer.state,
          zipCode: customer.zipCode,
          country: customer.country,
          dateOfBirth: customer.dateOfBirth?.toISOString() ?? null,
        });
      } catch (error) {
        if (error instanceof CustomerNotFoundError) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/orders",
    {
      schema: {
        body: z.object({
          customerId: z.uuid(),
          amount: z.coerce.number().int().positive(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { customerId, amount } = request.body;

        const order = await createOrder.execute({
          customerId,
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

  app.get(
    "/orders",
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          status: z.enum(Object.values(OrderStatus)).optional(),
          customerId: z.uuid().optional(),
        }),
      },
    },
    async (request) => {
      return listOrders.execute(request.query);
    },
  );

  app.get(
    "/orders/:id",
    {
      schema: {
        params: z.object({ id: z.uuid() }),
      },
    },
    async (request, reply) => {
      try {
        return await getOrder.execute({ orderId: request.params.id });
      } catch (error) {
        if (error instanceof OrderNotFoundError) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/orders/:id/cancel",
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        // Sem body, o Fastify entrega null.
        body: z
          .object({ reason: z.string().trim().min(1).optional() })
          .nullish(),
      },
    },
    async (request, reply) => {
      const orderId = request.params.id;

      try {
        await cancelOrder.execute({
          orderId,
          reason: request.body?.reason ?? DEFAULT_CANCEL_REASON,
        });

        return await getOrder.execute({ orderId });
      } catch (error) {
        if (error instanceof OrderNotFoundError) {
          return reply.status(404).send({ message: error.message });
        }
        if (error instanceof InvalidOrderStatusTransitionError) {
          return reply.status(409).send({
            message: `Order ${orderId} cannot be canceled: only pending orders can be canceled (${error.message})`,
          });
        }
        throw error;
      }
    },
  );

  return app;
}
