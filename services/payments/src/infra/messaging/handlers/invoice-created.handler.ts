import type { ConsumeMessage } from "amqplib";
import { invoiceCreatedMessageSchema } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import type { ProcessPaymentUseCase } from "../../../application/use-cases/process-payment.ts";

type ProcessPayment = Pick<ProcessPaymentUseCase, "execute">;

export function createInvoiceCreatedHandler(processPayment: ProcessPayment) {
  return async function handleInvoiceCreated(
    message: ConsumeMessage,
  ): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      throw new InvalidMessageError("InvoiceCreated message is not valid JSON");
    }

    const result = invoiceCreatedMessageSchema.safeParse(
      (payload as { data?: unknown } | null)?.data,
    );

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new InvalidMessageError(
        `Invalid InvoiceCreated message: ${issues}`,
      );
    }

    const { invoiceId, orderId, amount, customer } = result.data;

    await processPayment.execute({
      invoiceId,
      orderId,
      amountInCents: amount,
      customerId: customer.id,
    });
  };
}
