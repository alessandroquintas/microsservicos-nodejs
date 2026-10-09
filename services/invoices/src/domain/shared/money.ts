export class InvalidMoneyError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid money amount: ${value}. Must be a non-negative integer (cents).`,
    );
    this.name = "InvalidMoneyError";
  }
}

export class Money {
  readonly cents: number;

  private constructor(cents: number) {
    this.cents = cents;
  }

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new InvalidMoneyError(cents);
    }

    return new Money(cents);
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
