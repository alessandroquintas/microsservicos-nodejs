import * as pulumi from "@pulumi/pulumi";

import { ordersHttpListener, ordersService } from "./src/services/orders";
import {
  rabbitMQService,
  rabbitMQAdminHttpListener,
} from "./src/services/rabbitmq";
import { kongService, adminHttpListener } from "./src/services/kong";

export const ordersId = ordersService.service.id;
export const ordersUrl = pulumi.interpolate`http://${ordersHttpListener.endpoint.hostname}`;

export const rabbitMQId = rabbitMQService.service.id;
export const rabbitMQAdminUrl = pulumi.interpolate`http://${rabbitMQAdminHttpListener.endpoint.hostname}:15672`;

export const kongId = kongService.service.id;
export const kongUIUrl = pulumi.interpolate`http://${adminHttpListener.endpoint.hostname}:${adminHttpListener.endpoint.port}`;
