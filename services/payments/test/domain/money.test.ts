import { describe, expect, it } from "vitest";
import { InvalidMoneyError, Money } from "../../src/domain/shared/money.ts";

describe("Money", () => {
  it("creates money from cents", () => {
    expect(Money.fromCents(1050).cents).toBe(1050);
  });

  it("accepts zero", () => {
    expect(Money.fromCents(0).isZero()).toBe(true);
  });

  it.each([-1, 10.5, Number.NaN])("rejects %s", (value) => {
    expect(() => Money.fromCents(value)).toThrow(InvalidMoneyError);
  });

  it("compares by value", () => {
    expect(Money.fromCents(100).equals(Money.fromCents(100))).toBe(true);
    expect(Money.fromCents(100).equals(Money.fromCents(200))).toBe(false);
  });
});
