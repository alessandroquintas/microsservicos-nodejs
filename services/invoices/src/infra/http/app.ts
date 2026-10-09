import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { GetInvoiceUseCase } from "../../application/use-cases/get-invoice.ts";
import type { ListInvoicesUseCase } from "../../application/use-cases/list-invoices.ts";
import { DOMAIN_ERROR_STATUSES } from "./common/errors/domain-error-statuses.ts";
import { createErrorHandler } from "./common/errors/error-handler.ts";
import { InvoicesController } from "./controllers/invoices-controller.ts";
import { invoicesRoutes } from "./routes/invoices-routes.ts";

type AppDependencies = {
  getInvoice: Pick<GetInvoiceUseCase, "execute">;
  listInvoices: Pick<ListInvoicesUseCase, "execute">;
};

export function buildApp({ getInvoice, listInvoices }: AppDependencies) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();

  app.setSerializerCompiler(serializerCompiler);
  app.setValidatorCompiler(validatorCompiler);
  app.setErrorHandler(createErrorHandler(DOMAIN_ERROR_STATUSES));

  app.register(fastifyCors, { origin: "*" });

  app.get("/health", () => {
    return "Ok";
  });

  const invoicesController = new InvoicesController(getInvoice, listInvoices);

  app.register(invoicesRoutes(invoicesController));

  return app;
}
