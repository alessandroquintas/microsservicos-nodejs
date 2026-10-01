import * as docker from "@pulumi/docker-build";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const invoicesECRRepository = new awsx.ecr.Repository("app-invoices-ecr", {
  forceDelete: true,
});

const invoicesECRToken = aws.ecr.getAuthorizationTokenOutput({
  registryId: invoicesECRRepository.repository.registryId,
});

export const invoicesDockerImage = new docker.Image("app-invoices-image", {
  tags: [
    pulumi.interpolate`${invoicesECRRepository.repository.repositoryUrl}:latest`,
  ],
  context: {
    location: "../app-invoices",
  },
  push: true,
  platforms: ["linux/amd64"],
  registries: [
    {
      address: invoicesECRRepository.repository.repositoryUrl,
      username: invoicesECRToken.userName,
      password: invoicesECRToken.password,
    },
  ],
});
