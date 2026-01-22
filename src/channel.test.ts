import { describe, it, expect, vi, beforeEach } from "vitest";
import { Channel } from "./channel";
import { AsyncLocalStorage } from "als-browser";

describe("Channel", () => {
  let channel: Channel;

  beforeEach(() => {
    channel = new Channel("test");
  });

  describe("basic functionality", () => {
    it("should create a channel with a name", () => {
      expect(channel.name).toBe("test");
      expect(channel.hasSubscribers).toBe(false);
    });

    it("should handle subscribe/unsubscribe", () => {
      const handler = vi.fn();

      channel.subscribe(handler);
      expect(channel.hasSubscribers).toBe(true);

      channel.publish({ data: 123 });
      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test");

      const result = channel.unsubscribe(handler);
      expect(result).toBe(true);
      expect(channel.hasSubscribers).toBe(false);
    });

    it("should call all subscribers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      channel.subscribe(handler1);
      channel.subscribe(handler2);

      channel.publish({ data: 456 });

      expect(handler1).toHaveBeenCalledWith({ data: 456 }, "test");
      expect(handler2).toHaveBeenCalledWith({ data: 456 }, "test");
    });

    it("should swallow errors in handlers", async () => {
      const errorHandler = vi.fn(() => {
        throw new Error("handler error");
      });
      const successHandler = vi.fn();

      channel.subscribe(errorHandler);
      channel.subscribe(successHandler);

      // Mock window.dispatchEvent to capture error events
      const dispatchEventSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

      // Should not throw
      channel.publish({ data: 789 });

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();

      // Wait for microtask to complete
      await new Promise<void>(resolve => queueMicrotask(resolve));

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);

      const errorEvent = dispatchEventSpy.mock.calls[0][0] as ErrorEvent;
      expect(errorEvent).toBeInstanceOf(ErrorEvent);
      expect(errorEvent.type).toBe("error");
      expect(errorEvent.message).toBe("handler error");
      expect(errorEvent.error).toBeInstanceOf(Error);
      expect(errorEvent.error.message).toBe("handler error");

      dispatchEventSpy.mockRestore();
    });
  });

  describe("bindStore/unbindStore", () => {
    it("should bind an AsyncLocalStorage", () => {
      const store = new AsyncLocalStorage<any>();

      expect(() => channel.bindStore(store)).not.toThrow();
    });

    it("should throw if store doesn't have run method", () => {
      expect(() => channel.bindStore({} as any)).toThrow(
        "store must have a run method"
      );
    });

    it("should unbind a store", () => {
      const store = new AsyncLocalStorage<any>();

      channel.bindStore(store);
      const result = channel.unbindStore(store);

      expect(result).toBe(true);
    });

    it("should return false when unbinding non-existent store", () => {
      const store = new AsyncLocalStorage<any>();
      const result = channel.unbindStore(store);

      expect(result).toBe(false);
    });

    it("should support transform function", () => {
      const store = new AsyncLocalStorage<number>();
      const transform = (msg: any) => msg.value * 2;

      expect(() => channel.bindStore(store, transform)).not.toThrow();
    });
  });

  describe("runStores", () => {
    it("should run function and publish without bound stores", () => {
      const handler = vi.fn();
      const fn = vi.fn(() => 42);

      channel.subscribe(handler);

      const result = channel.runStores({ data: 123 }, fn);

      expect(result).toBe(42);
      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test");
      expect(fn).toHaveBeenCalled();
    });

    it("should run function within bound store context", () => {
      const store = new AsyncLocalStorage<any>();
      const handler = vi.fn();

      channel.bindStore(store);
      channel.subscribe(handler);

      const context = { userId: "123" };
      const result = channel.runStores(context, () => {
        return store.getStore();
      });

      expect(result).toBe(context);
      expect(handler).toHaveBeenCalledWith(context, "test");
    });

    it("should apply transform when binding store", () => {
      const store = new AsyncLocalStorage<number>();

      channel.bindStore(store, (msg: any) => msg.value * 2);

      const result = channel.runStores({ value: 21 }, () => {
        return store.getStore();
      });

      expect(result).toBe(42);
    });

    it("should nest multiple bound stores", () => {
      const store1 = new AsyncLocalStorage<string>();
      const store2 = new AsyncLocalStorage<number>();

      channel.bindStore(store1, (msg: any) => msg.name);
      channel.bindStore(store2, (msg: any) => msg.count);

      const context = { name: "test", count: 42 };
      const result = channel.runStores(context, () => {
        return {
          store1: store1.getStore(),
          store2: store2.getStore(),
        };
      });

      expect(result).toEqual({
        store1: "test",
        store2: 42,
      });
    });

    it("should handle multiple channels with different stores", () => {
      const channel1 = new Channel("channel1");
      const channel2 = new Channel("channel2");
      const store1 = new AsyncLocalStorage<string>();
      const store2 = new AsyncLocalStorage<number>();

      channel1.bindStore(store1);
      channel2.bindStore(store2);

      const result1 = channel1.runStores("hello", () => store1.getStore());
      const result2 = channel2.runStores(42, () => store2.getStore());

      expect(result1).toBe("hello");
      expect(result2).toBe(42);
    });

    it("should handle transform errors gracefully", async () => {
      const store = new AsyncLocalStorage<any>();
      const transform = () => {
        throw new Error("transform error");
      };

      channel.bindStore(store, transform);

      const dispatchEventSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

      const result = channel.runStores({ data: 123 }, () => {
        return 42;
      });

      // Should still return result even if transform fails
      expect(result).toBe(42);

      // Wait for microtask to complete
      await new Promise<void>(resolve => queueMicrotask(resolve));

      // Should have dispatched error event
      expect(dispatchEventSpy).toHaveBeenCalled();
      const errorEvent = dispatchEventSpy.mock.calls[0][0] as ErrorEvent;
      expect(errorEvent.error.message).toBe("transform error");

      dispatchEventSpy.mockRestore();
    });
  });

  describe("runStores with thisArg and args", () => {
    it("should apply function with thisArg", () => {
      const handler = vi.fn();
      channel.subscribe(handler);

      const context = { value: 42 };
      function getThis(this: typeof context) {
        return this.value;
      }

      const result = channel.runStores({ data: 123 }, getThis, context);

      expect(result).toBe(42);
      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test");
    });

    it("should apply function with args", () => {
      const handler = vi.fn();
      channel.subscribe(handler);

      function add(a: number, b: number, c: number) {
        return a + b + c;
      }

      const result = channel.runStores({ data: 123 }, add, undefined, 1, 2, 3);

      expect(result).toBe(6);
      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test");
    });

    it("should apply function with both thisArg and args", () => {
      const handler = vi.fn();
      channel.subscribe(handler);

      const context = { multiplier: 10 };
      function multiplyAdd(this: typeof context, a: number, b: number) {
        return (a + b) * this.multiplier;
      }

      const result = channel.runStores({ data: 123 }, multiplyAdd, context, 2, 3);

      expect(result).toBe(50);
      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test");
    });

    it("should work without thisArg or args", () => {
      const handler = vi.fn();
      channel.subscribe(handler);

      const result = channel.runStores({ data: 123 }, () => 42);

      expect(result).toBe(42);
      expect(handler).toHaveBeenCalledWith({ data: 123 }, "test");
    });
  });

  describe("edge cases", () => {
    it("should handle unsubscribe of non-existent handler", () => {
      const handler = vi.fn();
      const result = channel.unsubscribe(handler);
      expect(result).toBe(false);
    });

    it("should throw when subscribing non-function", () => {
      expect(() => channel.subscribe("not a function" as any)).toThrow(
        "subscription must be a function"
      );
    });

    it("should handle publishing with no subscribers", () => {
      const newChannel = new Channel("no-subs");
      expect(() => newChannel.publish({ data: 123 })).not.toThrow();
    });

    it("should handle symbol channel names", () => {
      const sym = Symbol("test");
      const symbolChannel = new Channel(sym);

      expect(symbolChannel.name).toBe(sym);

      const handler = vi.fn();
      symbolChannel.subscribe(handler);
      symbolChannel.publish({ data: 456 });

      expect(handler).toHaveBeenCalledWith({ data: 456 }, sym);
    });

    it("should preserve subscription order", () => {
      const order: number[] = [];

      channel.subscribe(() => order.push(1));
      channel.subscribe(() => order.push(2));
      channel.subscribe(() => order.push(3));

      channel.publish({});

      expect(order).toEqual([1, 2, 3]);
    });

    it("should handle multiple unsubscribe calls", () => {
      const handler = vi.fn();

      channel.subscribe(handler);
      expect(channel.unsubscribe(handler)).toBe(true);
      expect(channel.unsubscribe(handler)).toBe(false);
      expect(channel.unsubscribe(handler)).toBe(false);
    });
  });
});
