import type {
  PaymentApprovedMessage,
  PaymentFailedMessage,
} from "@microservices/contracts";
import type { PaymentEventsPublisher } from "../../src/application/ports/payment-events-publisher.ts";

export class FakePaymentEventsPublisher implements PaymentEventsPublisher {
  approved: PaymentApprovedMessage[] = [];
  failed: PaymentFailedMessage[] = [];

  async publishPaymentApproved(message: PaymentApprovedMessage): Promise<void> {
    this.approved.push(message);
  }

  async publishPaymentFailed(message: PaymentFailedMessage): Promise<void> {
    this.failed.push(message);
  }
}
