import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

export const ordersDatabaseUrl = config.requireSecret("ordersDatabaseUrl");
export const invoicesDatabaseUrl = config.requireSecret("invoicesDatabaseUrl");

export const otlpEndpoint = config.require("otlpEndpoint");
export const otlpHeaders = config.requireSecret("otlpHeaders");

export const rabbitmqUsername = config.requireSecret("brokerUsername");
export const rabbitmqPassword = config.requireSecret("brokerPassword");
