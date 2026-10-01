import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { cluster } from "../cluster";
import { invoicesDockerImage } from "../images/invoices";
import { appLoadBalancer } from "../load-balancer";
import { amqpListener } from "./rabbitmq";
import {
  invoicesDatabaseUrl,
  otlpEndpoint,
  otlpHeaders,
  rabbitmqPassword,
  rabbitmqUsername,
} from "../config";

const invoicesTargetGroup = appLoadBalancer.createTargetGroup(
  "invoices-target",
  {
    port: 3334, // a porta em que o Fastify escuta
    protocol: "HTTP",
    healthCheck: {
      path: "/health",
      protocol: "HTTP",
    },
  },
);

export const invoicesHttpListener = appLoadBalancer.createListener(
  "invoices-listener",
  {
    port: 3334,
    protocol: "HTTP",
    targetGroup: invoicesTargetGroup,
  },
);

export const invoicesService = new awsx.classic.ecs.FargateService(
  "fargate-invoices",
  {
    cluster,
    desiredCount: 1,
    waitForSteadyState: false,

    taskDefinitionArgs: {
      container: {
        portMappings: [invoicesHttpListener],
        image: invoicesDockerImage.ref,
        cpu: 256,
        memory: 512,
        environment: [
          {
            name: "BROKER_URL",
            value: pulumi.interpolate`amqp://${rabbitmqUsername}:${rabbitmqPassword}@${amqpListener.endpoint.hostname}:${amqpListener.endpoint.port}`,
          },
          {
            name: "DATABASE_URL",
            value: invoicesDatabaseUrl,
          },

          // OpenTelemetry -> Grafana Cloud
          { name: "OTEL_SERVICE_NAME", value: "app-invoices" },
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
