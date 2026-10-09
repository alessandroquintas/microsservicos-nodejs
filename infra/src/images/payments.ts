import * as docker from "@pulumi/docker-build";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const paymentsECRRepository = new awsx.ecr.Repository("app-payments-ecr", {
  forceDelete: true,
});

const paymentsECRToken = aws.ecr.getAuthorizationTokenOutput({
  registryId: paymentsECRRepository.repository.registryId,
});

export const paymentsDockerImage = new docker.Image("app-payments-image", {
  tags: [
    pulumi.interpolate`${paymentsECRRepository.repository.repositoryUrl}:latest`,
  ],
  context: {
    location: "..",
  },
  dockerfile: {
    location: "../services/payments/Dockerfile",
  },
  push: true,
  platforms: ["linux/amd64"],
  registries: [
    {
      address: paymentsECRRepository.repository.repositoryUrl,
      username: paymentsECRToken.userName,
      password: paymentsECRToken.password,
    },
  ],
});
