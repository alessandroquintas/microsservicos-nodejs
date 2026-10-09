import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { InvoicesController } from "../controllers/invoices-controller.ts";
import { sendResponse } from "../common/responses/http-response.ts";
import {
  invoiceParamsSchema,
  listInvoicesQuerySchema,
} from "../schemas/invoices-schemas.ts";

export function invoicesRoutes(
  controller: InvoicesController,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/invoices",
      { schema: { querystring: listInvoicesQuerySchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.list(request.query)),
    );

    app.get(
      "/invoices/:id",
      { schema: { params: invoiceParamsSchema } },
      async (request, reply) =>
        sendResponse(reply, await controller.getById(request.params)),
    );
  };
}
