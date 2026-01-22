import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  channel,
  hasSubscribers,
  subscribe,
  unsubscribe,
  tracingChannel,
  Channel,
  TracingChannel,
} from "./index";

describe("diagnostics_channel module", () => {
  describe("channel()", () => {
    it("should create a new channel with string name", () => {
      const ch = channel("test-channel");
      expect(ch).toBeInstanceOf(Channel);
      expect(ch.name).toBe("test-channel");
    });

    it("should create a new channel with symbol name", () => {
      const sym = Symbol("test");
      const ch = channel(sym);
      expect(ch).toBeInstanceOf(Channel);
      expect(ch.name).toBe(sym);
    });

    it("should reuse existing channel with same name", () => {
      const ch1 = channel("reuse-test");
      const ch2 = channel("reuse-test");
      expect(ch1).toBe(ch2);
    });

    it("should reuse existing channel with same symbol", () => {
      const sym = Symbol("reuse");
      const ch1 = channel(sym);
      const ch2 = channel(sym);
      expect(ch1).toBe(ch2);
    });

    it("should throw on invalid name type", () => {
      expect(() => channel(123 as any)).toThrow(
        "channel name must be a string or symbol"
      );
      expect(() => channel(null as any)).toThrow(
        "channel name must be a string or symbol"
      );
      expect(() => channel(undefined as any)).toThrow(
        "channel name must be a string or symbol"
      );
    });

    it("should maintain separate channels for string and symbol with same description", () => {
      const sym = Symbol("test");
      const ch1 = channel("test");
      const ch2 = channel(sym);
      expect(ch1).not.toBe(ch2);
    });
  });

  describe("hasSubscribers()", () => {
    it("should return false for channel with no subscribers", () => {
      const ch = channel("no-subs");
      expect(hasSubscribers("no-subs")).toBe(false);
    });

    it("should return true after subscribing", () => {
      const ch = channel("with-subs");
      ch.subscribe(() => {});
      expect(hasSubscribers("with-subs")).toBe(true);
    });

    it("should return false for non-existent channel", () => {
      expect(hasSubscribers("non-existent")).toBe(false);
    });

    it("should work with symbol names", () => {
      const sym = Symbol("test");
      expect(hasSubscribers(sym)).toBe(false);
      const ch = channel(sym);
      ch.subscribe(() => {});
      expect(hasSubscribers(sym)).toBe(true);
    });
  });

  describe("subscribe()", () => {
    it("should subscribe to a string-named channel", () => {
      const handler = vi.fn();
      subscribe("test-sub", handler);

      const ch = channel("test-sub");
      ch.publish({ data: 123 });

      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test-sub");
    });

    it("should subscribe to a symbol-named channel", () => {
      const sym = Symbol("test-sub");
      const handler = vi.fn();
      subscribe(sym, handler);

      const ch = channel(sym);
      ch.publish({ data: 456 });

      expect(handler).toHaveBeenCalledWith({ data: 456 }, sym);
    });

    it("should create channel if it doesn't exist", () => {
      const handler = vi.fn();
      subscribe("new-channel", handler);

      expect(hasSubscribers("new-channel")).toBe(true);
    });

    it("should allow multiple subscribers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      subscribe("multi", handler1);
      subscribe("multi", handler2);

      const ch = channel("multi");
      ch.publish({ data: 789 });

      expect(handler1).toHaveBeenCalledWith({ data: 789 }, "multi");
      expect(handler2).toHaveBeenCalledWith({ data: 789 }, "multi");
    });
  });

  describe("unsubscribe()", () => {
    it("should unsubscribe from a string-named channel", () => {
      const handler = vi.fn();
      subscribe("test-unsub", handler);

      const result = unsubscribe("test-unsub", handler);
      expect(result).toBe(true);

      const ch = channel("test-unsub");
      ch.publish({ data: 123 });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should unsubscribe from a symbol-named channel", () => {
      const sym = Symbol("test-unsub");
      const handler = vi.fn();
      subscribe(sym, handler);

      const result = unsubscribe(sym, handler);
      expect(result).toBe(true);

      const ch = channel(sym);
      ch.publish({ data: 456 });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should return false when unsubscribing non-existent handler", () => {
      const handler = vi.fn();
      subscribe("test", () => {});

      const result = unsubscribe("test", handler);
      expect(result).toBe(false);
    });

    it("should return false when unsubscribing non-existent channel", () => {
      const handler = vi.fn();
      const result = unsubscribe("non-existent", handler);
      expect(result).toBe(false);
    });

    it("should only remove specified handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      subscribe("selective", handler1);
      subscribe("selective", handler2);

      unsubscribe("selective", handler1);

      const ch = channel("selective");
      ch.publish({ data: 123 });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith({ data: 123 }, "selective");
    });
  });

  describe("tracingChannel()", () => {
    it("should create a TracingChannel with string name", () => {
      const tc = tracingChannel("trace-test");
      expect(tc).toBeInstanceOf(TracingChannel);
      expect(tc.start?.name).toBe("tracing:trace-test:start");
      expect(tc.end?.name).toBe("tracing:trace-test:end");
      expect(tc.asyncStart?.name).toBe("tracing:trace-test:asyncStart");
      expect(tc.asyncEnd?.name).toBe("tracing:trace-test:asyncEnd");
      expect(tc.error?.name).toBe("tracing:trace-test:error");
    });

    it("should create a TracingChannel with Channels object", () => {
      const startCh = new Channel("custom-start");
      const endCh = new Channel("custom-end");

      const tc = tracingChannel({
        start: startCh,
        end: endCh,
      });

      expect(tc).toBeInstanceOf(TracingChannel);
      expect(tc.start).toBe(startCh);
      expect(tc.end).toBe(endCh);
      expect(tc.asyncStart).toBeUndefined();
      expect(tc.asyncEnd).toBeUndefined();
      expect(tc.error).toBeUndefined();
    });

    it("should work with partial Channels object", () => {
      const errorCh = new Channel("error-only");

      const tc = tracingChannel({
        error: errorCh,
      });

      expect(tc.error).toBe(errorCh);
      expect(tc.start).toBeUndefined();
    });
  });

  describe("integration tests", () => {
    it("should work end-to-end with string channels", () => {
      const handler = vi.fn();
      subscribe("integration", handler);

      expect(hasSubscribers("integration")).toBe(true);

      const ch = channel("integration");
      ch.publish({ test: "data" });

      expect(handler).toHaveBeenCalledWith({ test: "data" }, "integration");

      unsubscribe("integration", handler);
      expect(hasSubscribers("integration")).toBe(false);
    });

    it("should work end-to-end with symbol channels", () => {
      const sym = Symbol("integration");
      const handler = vi.fn();

      subscribe(sym, handler);
      expect(hasSubscribers(sym)).toBe(true);

      const ch = channel(sym);
      ch.publish({ test: "data" });

      expect(handler).toHaveBeenCalledWith({ test: "data" }, sym);

      unsubscribe(sym, handler);
      expect(hasSubscribers(sym)).toBe(false);
    });

    it("should allow subscribing through different methods", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Subscribe via module function
      subscribe("mixed", handler1);

      // Subscribe via channel instance
      const ch = channel("mixed");
      ch.subscribe(handler2);

      ch.publish({ data: 123 });

      expect(handler1).toHaveBeenCalledWith({ data: 123 }, "mixed");
      expect(handler2).toHaveBeenCalledWith({ data: 123 }, "mixed");
    });
  });

  describe("type safety", () => {
    it("should maintain type safety for message type", () => {
      interface MyMessage {
        id: number;
        name: string;
      }

      const handler = vi.fn<(message: MyMessage, name: string) => void>();
      subscribe<MyMessage>("typed", handler);

      const ch = channel<MyMessage>("typed");
      ch.publish({ id: 1, name: "test" });

      expect(handler).toHaveBeenCalledWith(
        { id: 1, name: "test" },
        "typed"
      );
    });

    it("should maintain type safety with symbols", () => {
      interface MyMessage {
        value: number;
      }

      const sym = Symbol("typed");
      const handler = vi.fn<(message: MyMessage, name: symbol) => void>();
      subscribe<MyMessage>(sym, handler);

      const ch = channel<MyMessage>(sym);
      ch.publish({ value: 42 });

      expect(handler).toHaveBeenCalledWith({ value: 42 }, sym);
    });
  });

  describe("dual-package hazard prevention", () => {
    it("should store channels map on globalThis", () => {
      const CHANNELS_KEY = Symbol.for("dc-browser:channels");
      const globalMap = (globalThis as any)[CHANNELS_KEY];

      expect(globalMap).toBeDefined();
      expect(globalMap).toBeInstanceOf(Map);
    });

    it("should share channels across module systems", () => {
      // Create a channel
      const ch1 = channel("shared-test");
      const handler = vi.fn();
      ch1.subscribe(handler);

      // Access the same channel from globalThis
      const CHANNELS_KEY = Symbol.for("dc-browser:channels");
      const globalMap = (globalThis as any)[CHANNELS_KEY] as Map<string | symbol, Channel<any, any>>;
      const ch2 = globalMap.get("shared-test");

      expect(ch2).toBe(ch1);

      // Publishing to ch2 should trigger handler from ch1
      ch2?.publish({ test: "data" });
      expect(handler).toHaveBeenCalledWith({ test: "data" }, "shared-test");
    });
  });
});
