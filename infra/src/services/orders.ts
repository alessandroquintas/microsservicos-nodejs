import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { cluster } from "../cluster";
import { ordersDockerImage } from "../images/orders";
import { amqpListener } from "./rabbitmq";
import { appLoadBalancer } from "../load-balancer";
import {
  ordersDatabaseUrl,
  otlpEndpoint,
  otlpHeaders,
  rabbitmqPassword,
  rabbitmqUsername,
} from "../config";

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
  "fargate-orders",
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
            value: pulumi.interpolate`amqp://${rabbitmqUsername}:${rabbitmqPassword}@${amqpListener.endpoint.hostname}:${amqpListener.endpoint.port}`,
          },
          {
            name: "DATABASE_URL",
            value: ordersDatabaseUrl,
          },

          // OpenTelemetry -> Grafana Cloud
          { name: "OTEL_SERVICE_NAME", value: "app-orders" },
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
