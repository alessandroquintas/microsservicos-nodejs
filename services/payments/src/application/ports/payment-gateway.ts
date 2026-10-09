export type ChargeRequest = {
  amountInCents: number;
  customerId: string;
};

export type ChargeResult =
  { approved: true } | { approved: false; reason: string };

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
