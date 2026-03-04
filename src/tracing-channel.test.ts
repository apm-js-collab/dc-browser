import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetChannelRegistryForTest } from "./channel-registry";
import { TracingChannel } from "./tracing-channel";
import { Channel } from "./channel";

describe("TracingChannel", () => {
  beforeEach(() => {
    resetChannelRegistryForTest();
  });

  describe("channel creation", () => {
    it("should create 5 separate channels from string name", () => {
      const tc = new TracingChannel("test");

      expect(tc.start?.name).toBe("tracing:test:start");
      expect(tc.end?.name).toBe("tracing:test:end");
      expect(tc.asyncStart?.name).toBe("tracing:test:asyncStart");
      expect(tc.asyncEnd?.name).toBe("tracing:test:asyncEnd");
      expect(tc.error?.name).toBe("tracing:test:error");
    });

    it("should create new wrappers that share named channels", () => {
      const first = new TracingChannel("shared");
      const second = new TracingChannel("shared");

      expect(first).not.toBe(second);
      expect(first.start).toBe(second.start);
      expect(first.end).toBe(second.end);
      expect(first.asyncStart).toBe(second.asyncStart);
      expect(first.asyncEnd).toBe(second.asyncEnd);
      expect(first.error).toBe(second.error);
    });

    it("should create from Channels object with all channels", () => {
      const startCh = new Channel("start");
      const endCh = new Channel("end");
      const asyncStartCh = new Channel("asyncStart");
      const asyncEndCh = new Channel("asyncEnd");
      const errorCh = new Channel("error");

      const tc = new TracingChannel({
        start: startCh,
        end: endCh,
        asyncStart: asyncStartCh,
        asyncEnd: asyncEndCh,
        error: errorCh,
      });

      expect(tc.start).toBe(startCh);
      expect(tc.end).toBe(endCh);
      expect(tc.asyncStart).toBe(asyncStartCh);
      expect(tc.asyncEnd).toBe(asyncEndCh);
      expect(tc.error).toBe(errorCh);
    });

    it("should create from Channels object with partial channels", () => {
      const startCh = new Channel("start");
      const errorCh = new Channel("error");

      const tc = new TracingChannel({
        start: startCh,
        error: errorCh,
      });

      expect(tc.start).toBe(startCh);
      expect(tc.error).toBe(errorCh);
      expect(tc.end).toBeUndefined();
      expect(tc.asyncStart).toBeUndefined();
      expect(tc.asyncEnd).toBeUndefined();
    });

    it("should have no subscribers initially", () => {
      const tc = new TracingChannel("test");
      expect(tc.hasSubscribers).toBe(false);
    });

    it("should handle hasSubscribers with partial channels", () => {
      const startCh = new Channel("start");
      const tc = new TracingChannel({ start: startCh });

      expect(tc.hasSubscribers).toBe(false);

      startCh.subscribe(() => {});
      expect(tc.hasSubscribers).toBe(true);
    });
  });

  describe("subscribe/unsubscribe", () => {
    it("should subscribe to individual channels", () => {
      const tc = new TracingChannel("test");
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      tc.subscribe({
        start: startHandler,
        end: endHandler,
      });

      expect(tc.start!.hasSubscribers).toBe(true);
      expect(tc.end!.hasSubscribers).toBe(true);
      expect(tc.asyncStart!.hasSubscribers).toBe(false);
    });

    it("should unsubscribe from channels", () => {
      const tc = new TracingChannel("test");
      const handlers = {
        start: vi.fn(),
        end: vi.fn(),
      };

      tc.subscribe(handlers);
      expect(tc.hasSubscribers).toBe(true);

      const result = tc.unsubscribe(handlers);
      expect(result).toBe(true);
      expect(tc.hasSubscribers).toBe(false);
    });
  });

  describe("traceSync", () => {
    it("should publish start and end with shared context", () => {
      const tc = new TracingChannel("test");
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      tc.subscribe({
        start: startHandler,
        end: endHandler,
      });

      const result = tc.traceSync(() => 42, { foo: "bar" });

      expect(result).toBe(42);
      expect(startHandler).toHaveBeenCalledWith(
        expect.objectContaining({ foo: "bar" }),
        "tracing:test:start"
      );
      expect(endHandler).toHaveBeenCalledWith(
        expect.objectContaining({ foo: "bar", result: 42 }),
        "tracing:test:end"
      );

      // Verify same context object
      expect(startHandler.mock.calls[0][0]).toBe(endHandler.mock.calls[0][0]);
    });

    it("should publish error on exception", () => {
      const tc = new TracingChannel("test");
      const errorHandler = vi.fn();
      const endHandler = vi.fn();

      tc.subscribe({
        error: errorHandler,
        end: endHandler,
      });

      const testError = new Error("test error");
      expect(() => tc.traceSync(() => { throw testError; }, {})).toThrow(testError);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        "tracing:test:error"
      );
      expect(endHandler).toHaveBeenCalled();
    });
  });

  describe("tracePromise", () => {
    it("should publish start, asyncStart, asyncEnd, end", async () => {
      const tc = new TracingChannel("test");
      const startHandler = vi.fn();
      const endHandler = vi.fn();
      const asyncStartHandler = vi.fn();
      const asyncEndHandler = vi.fn();

      tc.subscribe({
        start: startHandler,
        end: endHandler,
        asyncStart: asyncStartHandler,
        asyncEnd: asyncEndHandler,
      });

      const result = await tc.tracePromise(async () => 42, {});

      expect(result).toBe(42);
      expect(startHandler).toHaveBeenCalled();
      expect(endHandler).toHaveBeenCalled();
      expect(asyncStartHandler).toHaveBeenCalledWith(
        expect.objectContaining({ result: 42 }),
        "tracing:test:asyncStart"
      );
      expect(asyncEndHandler).toHaveBeenCalledWith(
        expect.objectContaining({ result: 42 }),
        "tracing:test:asyncEnd"
      );
    });

    it("should publish error on async rejection", async () => {
      const tc = new TracingChannel("test");
      const errorHandler = vi.fn();

      tc.subscribe({
        error: errorHandler,
      });

      const testError = new Error("async error");
      await expect(tc.tracePromise(async () => {
        throw testError;
      }, {})).rejects.toThrow(testError);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        "tracing:test:error"
      );
    });

    it("should share context across all events", async () => {
      const tc = new TracingChannel("test");
      const contexts: any[] = [];

      tc.subscribe({
        start: (ctx) => contexts.push(ctx),
        end: (ctx) => contexts.push(ctx),
        asyncStart: (ctx) => contexts.push(ctx),
        asyncEnd: (ctx) => contexts.push(ctx),
      });

      await tc.tracePromise(async () => 42, { shared: "data" });

      // All should be the same context object
      expect(contexts[0]).toBe(contexts[1]);
      expect(contexts[1]).toBe(contexts[2]);
      expect(contexts[2]).toBe(contexts[3]);
      expect(contexts[0].shared).toBe("data");
    });
  });

  describe("traceCallback", () => {
    it("should wrap callback and publish events", async () => {
      const tc = new TracingChannel("test");
      const startHandler = vi.fn();
      const endHandler = vi.fn();
      const asyncStartHandler = vi.fn();
      const asyncEndHandler = vi.fn();

      tc.subscribe({
        start: startHandler,
        end: endHandler,
        asyncStart: asyncStartHandler,
        asyncEnd: asyncEndHandler,
      });

      const fn = (cb: (err: any, result: any) => void) => {
        setTimeout(() => cb(null, 42), 10);
      };

      const { err, result } = await new Promise<{ err: any; result: any }>((resolve) => {
        const wrappedCallback = (err: any, result: any) => {
          resolve({ err, result });
        };

        tc.traceCallback(fn, -1, { context: "data" }, undefined, wrappedCallback);
      });

      expect(err).toBeNull();
      expect(result).toBe(42);
      expect(startHandler).toHaveBeenCalled();
      expect(endHandler).toHaveBeenCalled();
      expect(asyncStartHandler).toHaveBeenCalled();
      expect(asyncEndHandler).toHaveBeenCalled();
    });

    it("should publish error on callback error", async () => {
      const tc = new TracingChannel("test");
      const errorHandler = vi.fn();

      tc.subscribe({
        error: errorHandler,
      });

      const testError = new Error("callback error");
      const fn = (cb: (err: any, result: any) => void) => {
        setTimeout(() => cb(testError, null), 10);
      };

      const { err } = await new Promise<{ err: any }>((resolve) => {
        const wrappedCallback = (err: any, result: any) => {
          setTimeout(() => resolve({ err }), 0);
        };

        tc.traceCallback(fn, -1, { context: "data" }, undefined, wrappedCallback);
      });

      expect(err).toBe(testError);
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        "tracing:test:error"
      );
    });

    it("should handle custom callback position", async () => {
      const tc = new TracingChannel("test");
      const startHandler = vi.fn();

      tc.subscribe({
        start: startHandler,
      });

      const fn = (a: number, cb: (err: any, result: any) => void, b: number) => {
        setTimeout(() => cb(null, a + b), 10);
      };

      const { result } = await new Promise<{ result: any }>((resolve) => {
        const wrappedCallback = (err: any, result: any) => {
          setTimeout(() => resolve({ result }), 0);
        };

        tc.traceCallback(fn, 1, { context: "data" }, undefined, 5, wrappedCallback, 10);
      });

      expect(result).toBe(15);
      expect(startHandler).toHaveBeenCalled();
    });

    it("should throw if callback is not a function", () => {
      const tc = new TracingChannel("test");
      tc.subscribe({ start: vi.fn() }); // Need subscribers to trigger check

      const fn = (notACallback: string) => {};

      expect(() => {
        tc.traceCallback(fn, -1, {}, undefined, "not a function");
      }).toThrow("callback must be a function");
    });
  });

  describe("hasSubscribers optimization", () => {
    it("should skip sync tracing when no subscribers", () => {
      const tc = new TracingChannel("test");
      const fn = vi.fn(() => 42);

      const result = tc.traceSync(fn, {});

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
      // No overhead when no subscribers
    });

    it("should skip async tracing when no subscribers", async () => {
      const tc = new TracingChannel("test");
      const fn = vi.fn(async () => 42);

      const result = await tc.tracePromise(fn, {});

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
    });

    it("should skip callback tracing when no subscribers", async () => {
      const tc = new TracingChannel("test");

      const fn = (cb: (err: any, result: any) => void) => {
        setTimeout(() => cb(null, 42), 10);
      };

      const { result } = await new Promise<{ result: any }>((resolve) => {
        const wrappedCallback = (err: any, result: any) => {
          resolve({ result });
        };

        tc.traceCallback(fn, -1, {}, undefined, wrappedCallback);
      });

      expect(result).toBe(42);
    });
  });

  describe("partial channels behavior", () => {
    it("should work with only start channel", () => {
      const startCh = new Channel("start");
      const tc = new TracingChannel({ start: startCh });
      const startHandler = vi.fn();

      startCh.subscribe(startHandler);

      const result = tc.traceSync(() => 42, { data: "test" });

      expect(result).toBe(42);
      expect(startHandler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "test" }),
        "start"
      );
    });

    it("should work with only end channel", () => {
      const endCh = new Channel("end");
      const tc = new TracingChannel({ end: endCh });
      const endHandler = vi.fn();

      endCh.subscribe(endHandler);

      const result = tc.traceSync(() => 42, { data: "test" });

      expect(result).toBe(42);
      expect(endHandler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "test" }),
        "end"
      );
    });

    it("should work with only error channel", () => {
      const errorCh = new Channel("error");
      const tc = new TracingChannel({ error: errorCh });
      const errorHandler = vi.fn();

      errorCh.subscribe(errorHandler);

      const testError = new Error("test");
      expect(() => tc.traceSync(() => { throw testError; }, {})).toThrow(testError);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        "error"
      );
    });

    it("should work with only asyncStart channel", async () => {
      const asyncStartCh = new Channel("asyncStart");
      const tc = new TracingChannel({ asyncStart: asyncStartCh });
      const asyncStartHandler = vi.fn();

      asyncStartCh.subscribe(asyncStartHandler);

      const result = await tc.tracePromise(async () => 42, { data: "test" });

      expect(result).toBe(42);
      expect(asyncStartHandler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "test", result: 42 }),
        "asyncStart"
      );
    });

    it("should work with only asyncEnd channel", async () => {
      const asyncEndCh = new Channel("asyncEnd");
      const tc = new TracingChannel({ asyncEnd: asyncEndCh });
      const asyncEndHandler = vi.fn();

      asyncEndCh.subscribe(asyncEndHandler);

      const result = await tc.tracePromise(async () => 42, { data: "test" });

      expect(result).toBe(42);
      expect(asyncEndHandler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "test", result: 42 }),
        "asyncEnd"
      );
    });
  });

  describe("thisArg and args handling", () => {
    it("should apply function with thisArg in traceSync", () => {
      const tc = new TracingChannel("test");
      tc.subscribe({ start: vi.fn() });

      const context = { value: 42 };
      function getThis(this: typeof context) {
        return this.value;
      }

      const result = tc.traceSync(getThis, {}, context);
      expect(result).toBe(42);
    });

    it("should apply function with args in traceSync", () => {
      const tc = new TracingChannel("test");
      tc.subscribe({ start: vi.fn() });

      function add(a: number, b: number) {
        return a + b;
      }

      const result = tc.traceSync(add, {}, undefined, 5, 10);
      expect(result).toBe(15);
    });

    it("should apply function with thisArg and args in tracePromise", async () => {
      const tc = new TracingChannel("test");
      tc.subscribe({ start: vi.fn() });

      const context = { multiplier: 2 };
      async function multiply(this: typeof context, a: number, b: number) {
        return (a + b) * this.multiplier;
      }

      const result = await tc.tracePromise(multiply, {}, context, 5, 10);
      expect(result).toBe(30);
    });
  });
});
