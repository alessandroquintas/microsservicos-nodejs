import {
  CustomerAlreadyExistsError,
  CustomerNotFoundError,
  EmptyCustomerFieldError,
  InvalidCustomerDateOfBirthError,
  InvalidCustomerEmailError,
} from "../../../../domain/customer/errors.ts";
import { OrderNotFoundError } from "../../../../domain/order/errors.ts";
import type { ErrorStatus } from "./error-handler.ts";

// Status HTTP de cada erro de domínio que chega às rotas.
export const DOMAIN_ERROR_STATUSES: readonly ErrorStatus[] = [
  [EmptyCustomerFieldError, 400],
  [InvalidCustomerEmailError, 400],
  [InvalidCustomerDateOfBirthError, 400],
  [CustomerNotFoundError, 404],
  [OrderNotFoundError, 404],
  [CustomerAlreadyExistsError, 409],
];
