import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  resetRateLimiter,
  cleanupRateLimiter,
  getClientIp,
  windows,
} from "../lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("allows first request", () => {
    const result = checkRateLimit("test:127.0.0.1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks when limit exceeded", () => {
    const key = "test:127.0.0.1";
    // maxAttempts=5 means requests 1-5 are allowed, 6th is blocked
    for (let i = 0; i < 6; i++) {
      const result = checkRateLimit(key, 5, 60_000);
      if (i < 5) expect(result.allowed).toBe(true);
      else expect(result.allowed).toBe(false);
    }
  });

  it("resets after window expires", () => {
    const key = "test:127.0.0.1";
    // Exhaust the limit
    for (let i = 0; i < 6; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(false);

    // Simulate window expiry by clearing the map
    resetRateLimiter();
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
  });

  it("tracks remaining count", () => {
    const key = "test:127.0.0.1";
    expect(checkRateLimit(key, 5, 60_000).remaining).toBe(4);
    expect(checkRateLimit(key, 5, 60_000).remaining).toBe(3);
    expect(checkRateLimit(key, 5, 60_000).remaining).toBe(2);
  });

  it("uses separate keys independently", () => {
    const resultA = checkRateLimit("key-a", 3, 60_000);
    const resultB = checkRateLimit("key-b", 3, 60_000);
    expect(resultA.allowed).toBe(true);
    expect(resultB.allowed).toBe(true);

    // Exhaust key-a
    checkRateLimit("key-a", 3, 60_000);
    checkRateLimit("key-a", 3, 60_000);
    expect(checkRateLimit("key-a", 3, 60_000).allowed).toBe(false);
    // key-b should still be available
    expect(checkRateLimit("key-b", 3, 60_000).remaining).toBe(1);
  });
});

describe("lastAccessed tracking", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("sets lastAccessed on first request", () => {
    checkRateLimit("test:127.0.0.1", 5, 60_000);
    const entry = windows.get("test:127.0.0.1");
    expect(entry).toBeDefined();
    expect(entry!.lastAccessed).toBeGreaterThan(0);
  });

  it("updates lastAccessed on subsequent requests", () => {
    checkRateLimit("test:127.0.0.1", 5, 60_000);
    const first = windows.get("test:127.0.0.1")!.lastAccessed;
    checkRateLimit("test:127.0.0.1", 5, 60_000);
    const second = windows.get("test:127.0.0.1")!.lastAccessed;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe("cleanupRateLimiter", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("cleans up expired entries", () => {
    // Create an entry with an expired window
    windows.set("stale:127.0.0.1", {
      count: 1,
      resetAt: Date.now() - 1000, // expired 1 second ago
      lastAccessed: Date.now() - 1000,
    });
    expect(windows.has("stale:127.0.0.1")).toBe(true);

    // Run cleanup 10 times to trigger the counter check
    for (let i = 0; i < 10; i++) {
      cleanupRateLimiter();
    }

    expect(windows.has("stale:127.0.0.1")).toBe(false);
  });

  it("evicts oldest entries when over MAX_ENTRIES", () => {
    // Fill just under the limit
    for (let i = 0; i < 10_000; i++) {
      windows.set(`key-${i}`, {
        count: 1,
        resetAt: Date.now() + 60_000,
        lastAccessed: Date.now() + i,
      });
    }
    // Add one more to exceed the limit
    windows.set("overflow", {
      count: 1,
      resetAt: Date.now() + 60_000,
      lastAccessed: Date.now() + 99_999,
    });

    // Run cleanup 10 times to trigger the counter check
    for (let i = 0; i < 10; i++) {
      cleanupRateLimiter();
    }

    // Should be back to MAX_ENTRIES
    expect(windows.size).toBeLessThanOrEqual(10_000);
    // The oldest entry should be gone
    expect(windows.has("key-0")).toBe(false);
    // The newest should still be there
    expect(windows.has("overflow")).toBe(true);
  });
});

describe("getClientIp", () => {
  it("extracts from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.42");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "198.51.100.7" },
    });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });

  it("defaults to 127.0.0.1", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("127.0.0.1");
  });
});

describe("resetRateLimiter", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("clears all windows", () => {
    checkRateLimit("key:127.0.0.1", 5, 60_000);
    expect(windows.size).toBe(1);
    resetRateLimiter();
    expect(windows.size).toBe(0);
  });
});