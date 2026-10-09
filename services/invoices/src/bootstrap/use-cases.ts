import { CreateInvoiceFromOrderUseCase } from "../application/use-cases/create-invoice-from-order.ts";
import { MarkInvoiceAsPaidUseCase } from "../application/use-cases/mark-invoice-as-paid.ts";
import { CancelInvoiceUseCase } from "../application/use-cases/cancel-invoice.ts";
import { GetInvoiceUseCase } from "../application/use-cases/get-invoice.ts";
import { ListInvoicesUseCase } from "../application/use-cases/list-invoices.ts";
import { db } from "../infra/db/client.ts";
import { DrizzleUnitOfWork } from "../infra/db/drizzle-unit-of-work.ts";
import { DrizzleInvoicesQuery } from "../infra/db/queries/drizzle-invoices-query.ts";
import { DrizzleInvoicesRepository } from "../infra/db/repositories/drizzle-invoices-repository.ts";

export function createUseCases() {
  // Adapters de saída
  const invoicesRepository = new DrizzleInvoicesRepository(db);
  const unitOfWork = new DrizzleUnitOfWork(db);
  const invoicesQuery = new DrizzleInvoicesQuery(db);

  return {
    createInvoiceFromOrder: new CreateInvoiceFromOrderUseCase(
      invoicesRepository,
      unitOfWork,
    ),
    markInvoiceAsPaid: new MarkInvoiceAsPaidUseCase(invoicesRepository),
    cancelInvoice: new CancelInvoiceUseCase(invoicesRepository),
    getInvoice: new GetInvoiceUseCase(invoicesQuery),
    listInvoices: new ListInvoicesUseCase(invoicesQuery),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
