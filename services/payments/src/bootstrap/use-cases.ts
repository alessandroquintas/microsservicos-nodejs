import { ProcessPaymentUseCase } from "../application/use-cases/process-payment.ts";
import { db } from "../infra/db/client.ts";
import { DrizzleUnitOfWork } from "../infra/db/drizzle-unit-of-work.ts";
import { DrizzlePaymentsRepository } from "../infra/db/repositories/drizzle-payments-repository.ts";
import { FakePaymentGateway } from "../infra/gateway/fake-payment-gateway.ts";

export function createUseCases() {
  // Adapters de saída
  const paymentsRepository = new DrizzlePaymentsRepository(db);
  const unitOfWork = new DrizzleUnitOfWork(db);
  const paymentGateway = new FakePaymentGateway({
    approvalRate: Number(process.env.PAYMENT_APPROVAL_RATE ?? 0.8),
  });

  return {
    processPayment: new ProcessPaymentUseCase(
      paymentsRepository,
      paymentGateway,
      unitOfWork,
    ),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
