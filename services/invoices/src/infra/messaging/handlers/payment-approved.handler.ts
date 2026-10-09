import type { ConsumeMessage } from "amqplib";
import { paymentApprovedMessageSchema } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import type { MarkInvoiceAsPaidUseCase } from "../../../application/use-cases/mark-invoice-as-paid.ts";
import {
  InvalidInvoiceStatusTransitionError,
  InvoiceNotFoundError,
} from "../../../domain/invoice/errors.ts";
import { toPermanentError } from "./permanent-errors.ts";

type MarkInvoiceAsPaid = Pick<MarkInvoiceAsPaidUseCase, "execute">;

export function createPaymentApprovedHandler(
  markInvoiceAsPaid: MarkInvoiceAsPaid,
) {
  return async function handlePaymentApproved(
    message: ConsumeMessage,
  ): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      throw new InvalidMessageError(
        "PaymentApproved message is not valid JSON",
      );
    }

    const result = paymentApprovedMessageSchema.safeParse(
      (payload as { data?: unknown } | null)?.data,
    );

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new InvalidMessageError(
        `Invalid PaymentApproved message: ${issues}`,
      );
    }

    // A fatura é gravada antes de o InvoiceCreated sair, então uma fatura
    // inexistente aqui não aparece com o tempo: vai para a DLQ.
    try {
      await markInvoiceAsPaid.execute({ invoiceId: result.data.invoiceId });
    } catch (error) {
      throw toPermanentError(error, [
        InvoiceNotFoundError,
        InvalidInvoiceStatusTransitionError,
      ]);
    }
  };
}
