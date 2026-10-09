import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { OrdersController } from "../controllers/orders-controller.ts";
import { sendResponse } from "../common/responses/http-response.ts";
import { errorResponseSchema } from "../common/schemas/error-response-schema.ts";
import {
  cancelOrderBodySchema,
  createOrderBodySchema,
  createOrderResponseSchema,
  listOrdersQuerySchema,
  orderParamsSchema,
  orderResponseSchema,
  ordersPageResponseSchema,
} from "../schemas/orders-schemas.ts";

export function ordersRoutes(
  controller: OrdersController,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/orders",
      {
        schema: {
          tags: ["Orders"],
          summary: "Cria um pedido",
          description: "Cria o pedido como pending e publica OrderCreated.",
          body: createOrderBodySchema,
          response: {
            201: createOrderResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema.describe("Cliente não encontrado"),
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.create(request.body)),
    );

    app.get(
      "/orders",
      {
        schema: {
          tags: ["Orders"],
          summary: "Lista pedidos (paginado)",
          querystring: listOrdersQuerySchema,
          response: {
            200: ordersPageResponseSchema,
            400: errorResponseSchema,
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.list(request.query)),
    );

    app.get(
      "/orders/:id",
      {
        schema: {
          tags: ["Orders"],
          summary: "Consulta um pedido",
          params: orderParamsSchema,
          response: {
            200: orderResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.getById(request.params)),
    );

    app.post(
      "/orders/:id/cancel",
      {
        schema: {
          tags: ["Orders"],
          summary: "Cancela um pedido",
          description:
            "Só pedidos pending podem ser cancelados. Publica OrderCanceled.",
          params: orderParamsSchema,
          body: cancelOrderBodySchema,
          response: {
            200: orderResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema.describe("Pedido não está pending"),
          },
        },
      },
      async (request, reply) =>
        sendResponse(
          reply,
          await controller.cancel(request.params, request.body),
        ),
    );
  };
}
