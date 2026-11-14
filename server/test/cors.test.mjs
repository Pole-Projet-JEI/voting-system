import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { test } from "node:test";
import cors from "cors";
import { createCorsOptions, getAllowedOrigins } from "../src/config/cors.mjs";

const createTestServer = async (configuration) => {
  const app = express();
  app.use(cors(createCorsOptions(configuration)));
  app.get("/resource", (_req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    server,
    request: (method, headers = {}) =>
      new Promise((resolve, reject) => {
        const request = http.request(
          {
            host: "127.0.0.1",
            port,
            path: "/resource",
            method,
            headers,
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response));
          }
        );
        request.on("error", reject);
        request.end();
      }),
  };
};

test("allows configured origins with credentials", async () => {
  const { server, request } = await createTestServer({
    nodeEnv: "production",
    rawOrigins: "https://trusted.example",
  });

  try {
    const response = await request("GET", { Origin: "https://trusted.example" });
    assert.equal(response.headers["access-control-allow-origin"], "https://trusted.example");
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  } finally {
    server.close();
  }
});

test("rejects unknown origins without reflecting them", async () => {
  const { server, request } = await createTestServer({
    nodeEnv: "production",
    rawOrigins: "https://trusted.example",
  });

  try {
    const response = await request("GET", { Origin: "https://attacker.example" });
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(response.headers["access-control-allow-credentials"], undefined);
  } finally {
    server.close();
  }
});

test("handles allowed preflight requests", async () => {
  const { server, request } = await createTestServer({
    nodeEnv: "production",
    rawOrigins: "https://trusted.example",
  });

  try {
    const response = await request("OPTIONS", {
      Origin: "https://trusted.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type",
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "https://trusted.example");
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  } finally {
    server.close();
  }
});

test("requests without Origin receive no CORS origin header", async () => {
  const { server, request } = await createTestServer({
    nodeEnv: "production",
    rawOrigins: "https://trusted.example",
  });

  try {
    const response = await request("GET");
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(response.headers["access-control-allow-credentials"], undefined);
  } finally {
    server.close();
  }
});

test("production requires explicit CORS configuration", () => {
  assert.throws(
    () => getAllowedOrigins({ nodeEnv: "production", rawOrigins: "" }),
    /CORS_ORIGINS must be configured/
  );
});
