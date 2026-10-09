import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { OrdersController } from "../controllers/orders-controller.ts";
import { sendResponse } from "../common/responses/http-response.ts";
import {
  cancelOrderBodySchema,
  createOrderBodySchema,
  listOrdersQuerySchema,
  orderParamsSchema,
} from "../schemas/orders-schemas.ts";

export function ordersRoutes(
  controller: OrdersController,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/orders",
      { schema: { body: createOrderBodySchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.create(request.body)),
    );

    app.get(
      "/orders",
      { schema: { querystring: listOrdersQuerySchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.list(request.query)),
    );

    app.get(
      "/orders/:id",
      { schema: { params: orderParamsSchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.getById(request.params)),
    );

    app.post(
      "/orders/:id/cancel",
      { schema: { params: orderParamsSchema, body: cancelOrderBodySchema } },
      async (request, reply) =>
        sendResponse(
          reply,
          await controller.cancel(request.params, request.body),
        ),
    );
  };
}
