import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

export const ordersDatabaseUrl = config.requireSecret("ordersDatabaseUrl");
export const invoicesDatabaseUrl = config.requireSecret("invoicesDatabaseUrl");
export const paymentsDatabaseUrl = config.requireSecret("paymentsDatabaseUrl");

// Probabilidade (0 a 1) de o FakePaymentGateway aprovar uma cobrança
export const paymentApprovalRate = config.get("paymentApprovalRate") ?? "0.8";

export const otlpEndpoint = config.require("otlpEndpoint");
export const otlpHeaders = config.requireSecret("otlpHeaders");

export const rabbitmqUsername = config.requireSecret("brokerUsername");
export const rabbitmqPassword = config.requireSecret("brokerPassword");
