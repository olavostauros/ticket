import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("Rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests over the limit", () => {
    const key = "test-block-key";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    const result = checkRateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const key = "test-reset-key";
    // Fill the window
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    // Should be blocked
    const blocked = checkRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    // A new key should start fresh
    const fresh = checkRateLimit("fresh-key", 5, 60_000);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(4);
  });
});