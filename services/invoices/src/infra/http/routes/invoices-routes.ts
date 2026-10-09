import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { InvoicesController } from "../controllers/invoices-controller.ts";
import { sendResponse } from "../common/responses/http-response.ts";
import { errorResponseSchema } from "../common/schemas/error-response-schema.ts";
import {
  invoiceParamsSchema,
  invoiceResponseSchema,
  invoicesPageResponseSchema,
  listInvoicesQuerySchema,
} from "../schemas/invoices-schemas.ts";

export function invoicesRoutes(
  controller: InvoicesController,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/invoices",
      {
        schema: {
          tags: ["Invoices"],
          summary: "Lista faturas (paginado)",
          querystring: listInvoicesQuerySchema,
          response: {
            200: invoicesPageResponseSchema,
            400: errorResponseSchema,
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.list(request.query)),
    );

    app.get(
      "/invoices/:id",
      {
        schema: {
          tags: ["Invoices"],
          summary: "Consulta uma fatura",
          params: invoiceParamsSchema,
          response: {
            200: invoiceResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) =>
        sendResponse(reply, await controller.getById(request.params)),
    );
  };
}
