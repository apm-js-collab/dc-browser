/**
 * Browser-compatible implementation of Node.js TracingChannel.
 *
 * A TracingChannel is a composite of 5 individual channels:
 * - start: Published before sync operation
 * - end: Published after sync operation completes
 * - asyncStart: Published when async operation's promise starts resolving
 * - asyncEnd: Published when async operation's promise finishes resolving
 * - error: Published when operation throws/rejects
 */

import { Channel } from "./channel";

export interface Channels<M> {
  readonly start?: Channel<M>;
  readonly end?: Channel<M>;
  readonly asyncStart?: Channel<M>;
  readonly asyncEnd?: Channel<M>;
  readonly error?: Channel<M>;
}

export interface ChannelHandlers<M> {
  start?: (context: M, name: string) => void;
  end?: (context: M, name: string) => void;
  asyncStart?: (context: M, name: string) => void;
  asyncEnd?: (context: M, name: string) => void;
  error?: (context: M, name: string) => void;
}

export class TracingChannel<M> {
  public readonly start?: Channel<M>;
  public readonly end?: Channel<M>;
  public readonly asyncStart?: Channel<M>;
  public readonly asyncEnd?: Channel<M>;
  public readonly error?: Channel<M>;

  constructor(nameOrChannels: string | Channels<M>) {
    if (typeof nameOrChannels === 'string') {
      // Create 5 separate channels with tracing: prefix
      this.start = new Channel(`tracing:${nameOrChannels}:start`);
      this.end = new Channel(`tracing:${nameOrChannels}:end`);
      this.asyncStart = new Channel(`tracing:${nameOrChannels}:asyncStart`);
      this.asyncEnd = new Channel(`tracing:${nameOrChannels}:asyncEnd`);
      this.error = new Channel(`tracing:${nameOrChannels}:error`);
    } else {
      this.start = nameOrChannels.start
      this.end = nameOrChannels.end
      this.asyncStart = nameOrChannels.asyncStart
      this.asyncEnd = nameOrChannels.asyncEnd
      this.error = nameOrChannels.error
    }
  }

  get hasSubscribers(): boolean {
    return this.start?.hasSubscribers ||
           this.end?.hasSubscribers ||
           this.asyncStart?.hasSubscribers ||
           this.asyncEnd?.hasSubscribers ||
           this.error?.hasSubscribers ||
           false;
  }

  subscribe(handlers: ChannelHandlers<M>): void {
    if (handlers.start) {
      this.start?.subscribe(handlers.start);
    }
    if (handlers.end) {
      this.end?.subscribe(handlers.end);
    }
    if (handlers.asyncStart) {
      this.asyncStart?.subscribe(handlers.asyncStart);
    }
    if (handlers.asyncEnd) {
      this.asyncEnd?.subscribe(handlers.asyncEnd);
    }
    if (handlers.error) {
      this.error?.subscribe(handlers.error);
    }
  }

  unsubscribe(handlers: ChannelHandlers<M>): boolean {
    let done = true;

    if (handlers.start && !this.start?.unsubscribe(handlers.start)) {
      done = false;
    }
    if (handlers.end && !this.end?.unsubscribe(handlers.end)) {
      done = false;
    }
    if (handlers.asyncStart && !this.asyncStart?.unsubscribe(handlers.asyncStart)) {
      done = false;
    }
    if (handlers.asyncEnd && !this.asyncEnd?.unsubscribe(handlers.asyncEnd)) {
      done = false;
    }
    if (handlers.error && !this.error?.unsubscribe(handlers.error)) {
      done = false;
    }

    return done;
  }

  #maybeRunStores<F extends (...args: any[]) => any>(
    channel: Channel<M> | undefined,
    message: M,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    if (!channel) {
      return Reflect.apply(fn, thisArg, args);
    }
    return channel.runStores(message, fn, thisArg, ...args)
  }

  traceSync<F extends (...args: any[]) => any>(
    fn: F,
    message: M,
    thisArg?: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    if (!this.hasSubscribers) {
      return Reflect.apply(fn, thisArg, args);
    }

    return this.#maybeRunStores(
      this.start,
      message,
      () => {
        try {
          const result = Reflect.apply(fn, thisArg, args);
          (message as any).result = result;
          return result;
        } catch (err) {
          (message as any).error = err;
          this.error?.publish(message);
          throw err;
        } finally {
          this.end?.publish(message);
        }
      }
    );
  }

  tracePromise<F extends (...args: any[]) => any>(
    fn: F,
    message: M,
    thisArg?: ThisParameterType<F>,
    ...args: Parameters<F>
  ): Promise<ReturnType<F>> {
    if (!this.hasSubscribers) {
      return Reflect.apply(fn, thisArg, args);
    }

    const { start, end, asyncStart, asyncEnd, error } = this;

    function reject(err: any) {
      (message as any).error = err;
      error?.publish(message);
      asyncStart?.publish(message);
      asyncEnd?.publish(message);
      return Promise.reject(err);
    }

    function resolve(result: ReturnType<F>) {
      (message as any).result = result;
      asyncStart?.publish(message);
      asyncEnd?.publish(message);
      return result;
    }

    return this.#maybeRunStores(
      start,
      message,
      () => {
        try {
          let promise = Reflect.apply(fn, thisArg, args);
          // Convert thenables to native promises
          if (!(promise instanceof Promise)) {
            promise = Promise.resolve(promise);
          }
          return promise.then(resolve, reject);
        } catch (err) {
          (message as any).error = err;
          error?.publish(message);
          throw err;
        } finally {
          end?.publish(message);
        }
      }
    );
  }

  traceCallback<F extends (...args: any[]) => any>(
    fn: F,
    position: number = -1,
    message: M,
    thisArg?: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    if (!this.hasSubscribers) {
      return Reflect.apply(fn, thisArg, args);
    }

    const { start, end, asyncStart, asyncEnd, error } = this;
    const self = this;

    function wrappedCallback(err: any, res: any) {
      if (err) {
        (message as any).error = err;
        error?.publish(message);
      } else {
        (message as any).result = res;
      }

      self.#maybeRunStores(
        asyncStart,
        message,
        () => {
          try {
            return Reflect.apply(callback, thisArg, arguments);
          } finally {
            asyncEnd?.publish(message);
          }
        }
      );
    }

    // Get the callback from args
    const callback = args.at(position);
    if (typeof callback !== 'function') {
      throw new TypeError('callback must be a function');
    }

    // Replace callback in args
    args.splice(position, 1, wrappedCallback);

    return this.#maybeRunStores(
      start,
      message,
      () => {
        try {
          return Reflect.apply(fn, thisArg, args);
        } catch (err) {
          (message as any).error = err;
          error?.publish(message);
          throw err;
        } finally {
          end?.publish(message);
        }
      }
    );
  }
}
