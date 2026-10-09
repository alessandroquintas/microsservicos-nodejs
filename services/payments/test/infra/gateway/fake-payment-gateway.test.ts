import { describe, expect, it } from "vitest";
import { FakePaymentGateway } from "../../../src/infra/gateway/fake-payment-gateway.ts";

const request = { amountInCents: 1050, customerId: "customer-1" };

describe("FakePaymentGateway", () => {
  it("approves when the random value is below the approval rate", async () => {
    const sut = new FakePaymentGateway({
      approvalRate: 0.8,
      random: () => 0.79,
    });

    expect(await sut.charge(request)).toEqual({ approved: true });
  });

  it("declines when the random value reaches the approval rate", async () => {
    const sut = new FakePaymentGateway({
      approvalRate: 0.8,
      random: () => 0.8,
    });

    expect(await sut.charge(request)).toEqual({
      approved: false,
      reason: "Card declined",
    });
  });

  it("always approves with rate 1 and always declines with rate 0", async () => {
    const random = () => 0.999;
    const approveAll = new FakePaymentGateway({ approvalRate: 1, random });
    const declineAll = new FakePaymentGateway({
      approvalRate: 0,
      random: () => 0,
    });

    expect((await approveAll.charge(request)).approved).toBe(true);
    expect((await declineAll.charge(request)).approved).toBe(false);
  });

  it.each([-0.1, 1.5, Number.NaN])("rejects the approval rate %s", (rate) => {
    expect(() => new FakePaymentGateway({ approvalRate: rate })).toThrow(
      /between 0 and 1/,
    );
  });
});
