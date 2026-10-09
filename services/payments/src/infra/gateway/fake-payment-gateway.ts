import type {
  ChargeRequest,
  ChargeResult,
  PaymentGateway,
} from "../../application/ports/payment-gateway.ts";

type FakePaymentGatewayOptions = {
  approvalRate: number;
  random?: () => number;
};

export const DECLINED_REASON = "Card declined";

// Simula um gateway de pagamento: aprova uma fração `approvalRate` (0 a 1) das
// cobranças. O `random` é injetável para os testes.
export class FakePaymentGateway implements PaymentGateway {
  #approvalRate: number;
  #random: () => number;

  constructor(options: FakePaymentGatewayOptions) {
    const { approvalRate } = options;

    if (
      !Number.isFinite(approvalRate) ||
      approvalRate < 0 ||
      approvalRate > 1
    ) {
      throw new Error(
        `Payment approval rate must be between 0 and 1, received ${approvalRate}`,
      );
    }

    this.#approvalRate = approvalRate;
    this.#random = options.random ?? Math.random;
  }

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    if (this.#random() < this.#approvalRate) {
      return { approved: true };
    }

    return { approved: false, reason: DECLINED_REASON };
  }
}
