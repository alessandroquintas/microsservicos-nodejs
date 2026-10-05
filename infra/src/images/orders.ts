import * as docker from "@pulumi/docker-build";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const ordersECRRepository = new awsx.ecr.Repository("app-orders-ecr", {
  forceDelete: true,
});

const ordersECRToken = aws.ecr.getAuthorizationTokenOutput({
  registryId: ordersECRRepository.repository.registryId,
});

export const ordersDockerImage = new docker.Image("app-orders-image", {
  tags: [
    pulumi.interpolate`${ordersECRRepository.repository.repositoryUrl}:latest`,
  ],
  context: {
    location: "..",
  },
  dockerfile: {
    location: "../services/orders/Dockerfile",
  },
  push: true,
  platforms: ["linux/amd64"],
  registries: [
    {
      address: ordersECRRepository.repository.repositoryUrl,
      username: ordersECRToken.userName,
      password: ordersECRToken.password,
    },
  ],
});
