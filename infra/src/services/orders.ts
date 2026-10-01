import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { cluster } from "../cluster";
import { ordersDockerImage } from "../images/orders";
import { amqpListener } from "./rabbitmq";
import { appLoadBalancer } from "../load-balancer";

const ordersTargetGroup = appLoadBalancer.createTargetGroup("orders-target", {
  port: 3333, // a porta em que o seu Fastify escuta
  protocol: "HTTP",
  healthCheck: {
    path: "/health",
    protocol: "HTTP",
  },
});

export const ordersHttpListener = appLoadBalancer.createListener(
  "orders-listener",
  {
    port: 3333,
    protocol: "HTTP",
    targetGroup: ordersTargetGroup,
  },
);

export const ordersService = new awsx.classic.ecs.FargateService(
  "farget-orders",
  {
    cluster,
    desiredCount: 1,
    waitForSteadyState: false,

    taskDefinitionArgs: {
      container: {
        portMappings: [ordersHttpListener],
        image: ordersDockerImage.ref,
        cpu: 256,
        memory: 512,
        environment: [
          {
            name: "BROKER_URL",
            value: pulumi.interpolate`amqp://root:root@${amqpListener.endpoint.hostname}:${amqpListener.endpoint.port}`,
          },
          {
            name: "DATABASE_URL",
            value:
              "postgresql://neondb_owner:npg_LeAfy91wWcGC@ep-wispy-salad-b56wravh.c-7.us-east-2.aws.neon.tech/orders?sslmode=require&channel_binding=require",
          },

          // OpenTelemetry -> Grafana Cloud
          { name: "OTEL_SERVICE_NAME", value: "app-orders" },
          { name: "OTEL_TRACES_EXPORTER", value: "otlp" },
          { name: "OTEL_EXPORTER_OTLP_PROTOCOL", value: "http/protobuf" },
          {
            name: "OTEL_EXPORTER_OTLP_ENDPOINT",
            value: "https://otlp-gateway-prod-sa-east-1.grafana.net/otlp",
          },
          {
            name: "OTEL_EXPORTER_OTLP_HEADERS",
            value:
              "Authorization=Basic MTg1MDczNjpnbGNfZXlKdklqb2lNVGt6TURBNE9TSXNJbTRpT2lKdGFXTnliM05sY25acFkyVnpMVzV2WkdVaUxDSnJJam9pTXpBeVlUUTViVXRXVURWc1JEZzRjVzR3UTNKNU1rbEVJaXdpYlNJNmV5SnlJam9pY0hKdlpDMXpZUzFsWVhOMExURWlmWDA9",
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
