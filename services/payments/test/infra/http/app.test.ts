import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../../src/infra/http/app.ts";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns Ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("Ok");
  });
});
