import type { InvoiceStatus } from "../../domain/invoice/invoice-entity.ts";

export type InvoiceView = {
  id: string;
  orderId: string;
  amount: number;
  status: InvoiceStatus;
  customer: { id: string; name: string; email: string };
  dueDate: string;
  createdAt: string;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type ListInvoicesFilters = {
  page: number;
  pageSize: number;
  status?: InvoiceStatus;
  orderId?: string;
};

export interface InvoicesQuery {
  findById(id: string): Promise<InvoiceView | null>;
  list(filters: ListInvoicesFilters): Promise<Page<InvoiceView>>;
}
