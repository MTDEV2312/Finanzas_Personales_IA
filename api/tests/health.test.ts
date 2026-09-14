import { describe, it, expect, afterAll } from "bun:test";
import { server } from "../index";

describe("Health Check Endpoint", () => {
  afterAll(() => {
    server.stop(true);
  });

  it("GET /health returns HTTP 200 and status ok payload", async () => {
    const res = await server.fetch(new Request("http://localhost:3000/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");

    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
