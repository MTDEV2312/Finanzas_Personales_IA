import { describe, expect, it } from "bun:test";

describe("Groq service module", () => {
  it("can be imported without GROQ_API_KEY", async () => {
    const originalGroqApiKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const module = await import("../services/groq");
      expect(module.groqService.name).toBe("groq");
    } finally {
      if (originalGroqApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalGroqApiKey;
      }
    }
  });
});
