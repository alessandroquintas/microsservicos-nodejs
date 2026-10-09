import { InvoiceNotFoundError } from "../../../../domain/invoice/errors.ts";
import type { ErrorStatus } from "./error-handler.ts";

// Status HTTP de cada erro de domínio que chega às rotas.
export const DOMAIN_ERROR_STATUSES: readonly ErrorStatus[] = [
  [InvoiceNotFoundError, 404],
];
