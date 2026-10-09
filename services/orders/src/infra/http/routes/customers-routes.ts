import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { CustomersController } from "../controllers/customers-controller.ts";
import { sendResponse } from "../common/responses/http-response.ts";
import {
  createCustomerBodySchema,
  customerParamsSchema,
} from "../schemas/customers-schemas.ts";

export function customersRoutes(
  controller: CustomersController,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/customers",
      { schema: { body: createCustomerBodySchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.create(request.body)),
    );

    app.get(
      "/customers/:id",
      { schema: { params: customerParamsSchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.getById(request.params)),
    );
  };
}
