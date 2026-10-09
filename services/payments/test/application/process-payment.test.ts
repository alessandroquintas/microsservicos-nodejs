import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessPaymentUseCase } from "../../src/application/use-cases/process-payment.ts";
import { PaymentStatus } from "../../src/domain/payment/payment-entity.ts";
import { FakePaymentGateway } from "../../src/infra/gateway/fake-payment-gateway.ts";
import { FakePaymentEventsPublisher } from "../fakes/fake-payment-events-publisher.ts";
import { InMemoryPaymentsRepository } from "../fakes/in-memory-payments-repository.ts";
import { InMemoryUnitOfWork } from "../fakes/in-memory-unit-of-work.ts";

const args = {
  invoiceId: randomUUID(),
  orderId: randomUUID(),
  amountInCents: 1050,
  customerId: randomUUID(),
};

let paymentsRepository: InMemoryPaymentsRepository;
let paymentEventsPublisher: FakePaymentEventsPublisher;

function makeSut(approvalRate: number) {
  const gateway = new FakePaymentGateway({ approvalRate, random: () => 0.5 });
  vi.spyOn(gateway, "charge");

  const sut = new ProcessPaymentUseCase(
    paymentsRepository,
    gateway,
    new InMemoryUnitOfWork(paymentsRepository, paymentEventsPublisher),
  );

  return { sut, gateway };
}

beforeEach(() => {
  paymentsRepository = new InMemoryPaymentsRepository();
  paymentEventsPublisher = new FakePaymentEventsPublisher();
});

describe("ProcessPaymentUseCase", () => {
  it("charges the customer and publishes PaymentApproved when approved", async () => {
    const { sut, gateway } = makeSut(1);

    const payment = await sut.execute(args);

    expect(gateway.charge).toHaveBeenCalledWith({
      amountInCents: 1050,
      customerId: args.customerId,
    });
    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(paymentsRepository.items).toEqual([payment]);
    expect(paymentEventsPublisher.approved).toEqual([
      {
        paymentId: payment.id,
        invoiceId: args.invoiceId,
        orderId: args.orderId,
        amount: 1050,
      },
    ]);
    expect(paymentEventsPublisher.failed).toHaveLength(0);
  });

  it("saves a failed payment and publishes PaymentFailed when declined", async () => {
    const { sut } = makeSut(0);

    const payment = await sut.execute(args);

    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(payment.failureReason).toBe("Card declined");
    expect(paymentsRepository.items).toEqual([payment]);
    expect(paymentEventsPublisher.failed).toEqual([
      {
        paymentId: payment.id,
        invoiceId: args.invoiceId,
        orderId: args.orderId,
        amount: 1050,
        reason: "Card declined",
      },
    ]);
    expect(paymentEventsPublisher.approved).toHaveLength(0);
  });

  it("does not charge nor publish again for an invoice already processed", async () => {
    const { sut, gateway } = makeSut(1);

    const first = await sut.execute(args);
    const second = await sut.execute(args);

    expect(second.id).toBe(first.id);
    expect(gateway.charge).toHaveBeenCalledOnce();
    expect(paymentsRepository.items).toHaveLength(1);
    expect(paymentEventsPublisher.approved).toHaveLength(1);
  });

  it("does not publish twice when two deliveries run concurrently", async () => {
    const { sut } = makeSut(1);

    const [first, second] = await Promise.all([
      sut.execute(args),
      sut.execute(args),
    ]);

    expect(second.id).toBe(first.id);
    expect(paymentsRepository.items).toHaveLength(1);
    expect(paymentEventsPublisher.approved).toHaveLength(1);
  });
});
