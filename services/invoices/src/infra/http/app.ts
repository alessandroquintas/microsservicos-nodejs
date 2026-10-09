import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { z } from "zod";

import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { GetInvoiceUseCase } from "../../application/use-cases/get-invoice.ts";
import type { ListInvoicesUseCase } from "../../application/use-cases/list-invoices.ts";
import { InvoiceNotFoundError } from "../../domain/invoice/errors.ts";
import { InvoiceStatus } from "../../domain/invoice/invoice-entity.ts";

type AppDependencies = {
  getInvoice: Pick<GetInvoiceUseCase, "execute">;
  listInvoices: Pick<ListInvoicesUseCase, "execute">;
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

export function buildApp({ getInvoice, listInvoices }: AppDependencies) {
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

  app.get(
    "/invoices",
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          status: z.enum(Object.values(InvoiceStatus)).optional(),
          orderId: z.uuid().optional(),
        }),
      },
    },
    async (request) => {
      return listInvoices.execute(request.query);
    },
  );

  app.get(
    "/invoices/:id",
    {
      schema: {
        params: z.object({ id: z.uuid() }),
      },
    },
    async (request, reply) => {
      try {
        return await getInvoice.execute({ invoiceId: request.params.id });
      } catch (error) {
        if (error instanceof InvoiceNotFoundError) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  return app;
}
