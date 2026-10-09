import type { PaymentsRepository } from "../../domain/payment/payments-repository.ts";
import type { PaymentEventsPublisher } from "./payment-events-publisher.ts";

export type UnitOfWorkContext = {
  payments: PaymentsRepository;
  paymentEvents: PaymentEventsPublisher;
};

export interface UnitOfWork {
  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
