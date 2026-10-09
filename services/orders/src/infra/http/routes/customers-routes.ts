import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { CustomersController } from "../controllers/customers-controller.ts";
import { sendResponse } from "../common/responses/http-response.ts";
import { errorResponseSchema } from "../common/schemas/error-response-schema.ts";
import {
  createCustomerBodySchema,
  createCustomerResponseSchema,
  customerParamsSchema,
  customerResponseSchema,
} from "../schemas/customers-schemas.ts";

export function customersRoutes(
  controller: CustomersController,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/customers",
      {
        schema: {
          tags: ["Customers"],
          summary: "Cria um cliente",
          body: createCustomerBodySchema,
          response: {
            201: createCustomerResponseSchema,
            400: errorResponseSchema,
            409: errorResponseSchema.describe("E-mail já cadastrado"),
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.create(request.body)),
    );

    app.get(
      "/customers/:id",
      {
        schema: {
          tags: ["Customers"],
          summary: "Consulta um cliente",
          params: customerParamsSchema,
          response: {
            200: customerResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.getById(request.params)),
    );
  };
}
