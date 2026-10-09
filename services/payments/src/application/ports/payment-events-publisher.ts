import type {
  PaymentApprovedMessage,
  PaymentFailedMessage,
} from "@microservices/contracts";

export interface PaymentEventsPublisher {
  publishPaymentApproved(message: PaymentApprovedMessage): Promise<void>;
  publishPaymentFailed(message: PaymentFailedMessage): Promise<void>;
}
