/**
 * dc-browser
 *
 * Browser-compatible polyfill for Node.js diagnostics_channel.
 * Matches the API from Node.js core exactly.
 */

import { Channel, type MessageFunction } from "./channel";
import { TracingChannel, type Channels } from "./tracing-channel";

// Symbol key for storing the channels map on globalThis to avoid dual-package hazard
const CHANNELS_KEY = Symbol.for("dc-browser:channels");

// Global registry of channels (type-erased storage)
// Store on globalThis to share between ESM and CJS builds
const channels: Map<string | symbol, Channel<any, any>> =
  (globalThis as any)[CHANNELS_KEY] ||
  ((globalThis as any)[CHANNELS_KEY] = new Map<string | symbol, Channel<any, any>>());

/**
 * Get or create a channel by name.
 * Matches Node.js channel() API.
 */
export function channel<M>(name: string): Channel<M, string>;
export function channel<M>(name: symbol): Channel<M, symbol>;
export function channel<M, N extends string | symbol>(name: N): Channel<M, N> {
  if (typeof name !== 'string' && typeof name !== 'symbol') {
    throw new TypeError('channel name must be a string or symbol');
  }

  let ch = channels.get(name);
  if (!ch) {
    ch = new Channel(name);
    channels.set(name, ch as Channel<any, any>);
  }
  return ch;
}

/**
 * Check if a channel has subscribers.
 * Matches Node.js hasSubscribers() API.
 */
export function hasSubscribers(name: string | symbol): boolean {
  const ch = channels.get(name);
  return ch ? ch.hasSubscribers : false;
}

/**
 * Subscribe to a channel.
 * Matches Node.js subscribe() API.
 */
export function subscribe<M>(name: string, subscription: MessageFunction<M, string>): void;
export function subscribe<M>(name: symbol, subscription: MessageFunction<M, symbol>): void;
export function subscribe<M, N extends string | symbol>(name: N, subscription: MessageFunction<M, N>): void {
  const ch = channel<M>(name as any) as unknown as Channel<M, N>;
  ch.subscribe(subscription);
}

/**
 * Unsubscribe from a channel.
 * Matches Node.js unsubscribe() API.
 */
export function unsubscribe<M>(name: string, subscription: MessageFunction<M, string>): boolean;
export function unsubscribe<M>(name: symbol, subscription: MessageFunction<M, symbol>): boolean;
export function unsubscribe<M, N extends string | symbol>(name: N, subscription: MessageFunction<M, N>): boolean {
  const ch = channel<M>(name as any) as unknown as Channel<M, N>;
  return ch.unsubscribe(subscription);
}

/**
 * Create a TracingChannel.
 * Matches Node.js tracingChannel() API.
 */
export function tracingChannel<M>(nameOrChannels: string | Channels<M>): TracingChannel<M> {
  return new TracingChannel(nameOrChannels);
}

// Re-export classes
export { Channel, type TransformFunction, type MessageFunction } from "./channel";
export { TracingChannel, type ChannelHandlers } from "./tracing-channel";
