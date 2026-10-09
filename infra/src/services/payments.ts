import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { cluster } from "../cluster";
import { paymentsDockerImage } from "../images/payments";
import { amqpListener } from "./rabbitmq";
import {
  otlpEndpoint,
  otlpHeaders,
  paymentApprovalRate,
  paymentsDatabaseUrl,
  rabbitmqPassword,
  rabbitmqUsername,
} from "../config";

// Sem target group nem listener: o payments não recebe tráfego HTTP externo,
// só consome e publica eventos no RabbitMQ.
export const paymentsService = new awsx.classic.ecs.FargateService(
  "fargate-payments",
  {
    cluster,
    desiredCount: 1,
    waitForSteadyState: false,

    taskDefinitionArgs: {
      container: {
        portMappings: [{ containerPort: 3335 }],
        image: paymentsDockerImage.ref,
        cpu: 256,
        memory: 512,
        environment: [
          { name: "PORT", value: "3335" },
          {
            name: "BROKER_URL",
            value: pulumi.interpolate`amqp://${rabbitmqUsername}:${rabbitmqPassword}@${amqpListener.endpoint.hostname}:${amqpListener.endpoint.port}`,
          },
          {
            name: "DATABASE_URL",
            value: paymentsDatabaseUrl,
          },
          { name: "PAYMENT_APPROVAL_RATE", value: paymentApprovalRate },

          // OpenTelemetry -> Grafana Cloud
          { name: "OTEL_SERVICE_NAME", value: "app-payments" },
          { name: "OTEL_TRACES_EXPORTER", value: "otlp" },
          { name: "OTEL_EXPORTER_OTLP_PROTOCOL", value: "http/protobuf" },
          {
            name: "OTEL_EXPORTER_OTLP_ENDPOINT",
            value: otlpEndpoint,
          },
          {
            name: "OTEL_EXPORTER_OTLP_HEADERS",
            value: otlpHeaders,
          },
          { name: "OTEL_NODE_RESOURCE_DETECTORS", value: "env,host,os" },
          {
            name: "OTEL_NODE_ENABLED_INSTRUMENTATIONS",
            value: "http,fastify,pg,amqplib",
          },
        ],
      },
    },
  },
);
