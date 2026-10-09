import type { GetInvoiceUseCase } from "../../../application/use-cases/get-invoice.ts";
import type { ListInvoicesUseCase } from "../../../application/use-cases/list-invoices.ts";
import { ok, type HttpResponse } from "../common/responses/http-response.ts";
import type {
  InvoiceParams,
  ListInvoicesQuery,
} from "../schemas/invoices-schemas.ts";

type GetInvoice = Pick<GetInvoiceUseCase, "execute">;
type ListInvoices = Pick<ListInvoicesUseCase, "execute">;

export class InvoicesController {
  #getInvoice: GetInvoice;
  #listInvoices: ListInvoices;

  constructor(getInvoice: GetInvoice, listInvoices: ListInvoices) {
    this.#getInvoice = getInvoice;
    this.#listInvoices = listInvoices;
  }

  async list(query: ListInvoicesQuery): Promise<HttpResponse> {
    return ok(await this.#listInvoices.execute(query));
  }

  async getById(params: InvoiceParams): Promise<HttpResponse> {
    return ok(await this.#getInvoice.execute({ invoiceId: params.id }));
  }
}
