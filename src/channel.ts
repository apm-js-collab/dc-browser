/**
 * Browser-compatible implementation of Node.js Channel.
 *
 * Each channel is its own object with its own subscribers.
 */

// Type definition for AsyncLocalStorage to avoid hard dependency
interface AsyncLocalStorageLike<T> {
  run<R>(store: T, callback: () => R): R;
}

export type TransformFunction<M, S> = (message: M) => S;
export type MessageFunction<M, N> = (message: M, name: N) => void

function triggerUncaughtException(err: any, _: boolean) {
  window.dispatchEvent(
    new ErrorEvent('error', {
      error: err,
      message: (err as any)?.message,
    })
  );
}

function defaultTransform<M>(message: M): any {
  return message;
}

function wrapStoreRun<S, M, N>(
  store: AsyncLocalStorageLike<S>,
  message: M,
  next: () => N,
  transform: TransformFunction<M, S> | undefined = defaultTransform
): () => N {
  return () => {
    let context;
    try {
      context = transform(message);
    } catch (err) {
      queueMicrotask(() => {
        triggerUncaughtException(err, false);
      });
      return next();
    }

    return store.run(context, next);
  };
}

export class Channel<M = any, N = string> {
  public readonly name: N;
  private _subscribers: Array<MessageFunction<M, N>>;
  private _stores: Map<AsyncLocalStorageLike<any>, TransformFunction<M, any>>;

  constructor(name: N) {
    this.name = name;
    this._subscribers = [];
    this._stores = new Map();
  }

  get hasSubscribers(): boolean {
    return this._subscribers.length > 0;
  }

  subscribe(subscription: MessageFunction<M, N>): void {
    if (typeof subscription !== 'function') {
      throw new TypeError('subscription must be a function');
    }

    // Ensure we don't modify a subscriber list while being iterated
    this._subscribers = this._subscribers.slice();
    this._subscribers.push(subscription);
  }

  unsubscribe(subscription: MessageFunction<M, N>): boolean {
    const index = this._subscribers.indexOf(subscription);
    if (index === -1) {
      return false;
    }

    const before = this._subscribers.slice(0, index);
    const after = this._subscribers.slice(index + 1);
    this._subscribers = before;
    this._subscribers.push(...after);

    return true;
  }

  bindStore<T>(store: AsyncLocalStorageLike<T>, transform?: TransformFunction<M, T>): void {
    if (!store || typeof store.run !== 'function') {
      throw new TypeError('store must have a run method');
    }
    this._stores.set(store, transform as TransformFunction<M, any>);
  }

  unbindStore<T>(store: AsyncLocalStorageLike<T>): boolean {
    if (!this._stores.has(store)) {
      return false;
    }

    this._stores.delete(store);

    return true;
  }

  publish(message: M): void {
    const subscribers = this._subscribers;
    for (let i = 0; i < (subscribers?.length || 0); i++) {
      try {
        const onMessage = subscribers[i];
        onMessage(message, this.name);
      } catch (err) {
        queueMicrotask(() => {
          triggerUncaughtException(err, false);
        });
      }
    }
  }

  runStores<F extends (...args: any[]) => any>(
    message: M,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    let run = () => {
      this.publish(message);
      return Reflect.apply(fn, thisArg, args);
    };

    for (const entry of this._stores.entries()) {
      const store = entry[0];
      const transform = entry[1];
      run = wrapStoreRun(store, message, run, transform);
    }

    return run();
  }
}
