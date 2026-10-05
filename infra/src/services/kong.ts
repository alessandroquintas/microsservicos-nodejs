import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { cluster } from "../cluster";
import { kongDockerImage } from "../images/kong";
import { ordersHttpListener } from "./orders";
import { appLoadBalancer } from "../load-balancer";
import { invoicesHttpListener } from "./invoices";

const proxyTargetGroup = appLoadBalancer.createTargetGroup("proxy-target", {
  port: 8000, // tráfego dos clientes: proxy do Kong
  protocol: "HTTP",
  healthCheck: {
    path: "/status/ready",
    port: "8100", // health check: Status API do Kong
    protocol: "HTTP",
  },
});

export const proxyHttpListener = appLoadBalancer.createListener(
  "proxy-listener",
  {
    port: 80,
    protocol: "HTTP",
    targetGroup: proxyTargetGroup,
  },
);

const adminTargetGroup = appLoadBalancer.createTargetGroup("admin-target", {
  port: 8002,
  protocol: "HTTP",
  healthCheck: {
    path: "/",
    protocol: "HTTP",
  },
});

export const adminHttpListener = appLoadBalancer.createListener(
  "admin-listener",
  {
    port: 8002,
    protocol: "HTTP",
    targetGroup: adminTargetGroup,
  },
);

const adminAPITargetGroup = appLoadBalancer.createTargetGroup(
  "admin-api-target",
  {
    port: 8001,
    protocol: "HTTP",
    healthCheck: {
      path: "/",
      protocol: "HTTP",
    },
  },
);

export const adminAPIHttpListener = appLoadBalancer.createListener(
  "admin-api-listener",
  {
    port: 8001,
    protocol: "HTTP",
    targetGroup: adminAPITargetGroup,
  },
);

export const kongService = new awsx.classic.ecs.FargateService("fargate-kong", {
  cluster,
  desiredCount: 1,
  waitForSteadyState: false,
  taskDefinitionArgs: {
    container: {
      image: kongDockerImage.ref,
      cpu: 256,
      memory: 512,
      portMappings: [
        proxyHttpListener,
        adminHttpListener,
        adminAPIHttpListener,
        { containerPort: 8100 },
      ],
      environment: [
        { name: "KONG_DATABASE", value: "off" },
        { name: "KONG_ADMIN_LISTEN", value: "0.0.0.0:8001" },
        { name: "KONG_STATUS_LISTEN", value: "0.0.0.0:8100" },
        {
          name: "ORDERS_SERVICE_URL",
          value: pulumi.interpolate`http://${ordersHttpListener.endpoint.hostname}:${ordersHttpListener.endpoint.port}`,
        },
        {
          name: "INVOICES_SERVICE_URL",
          value: pulumi.interpolate`http://${invoicesHttpListener.endpoint.hostname}:${invoicesHttpListener.endpoint.port}`,
        },
      ],
    },
  },
});
