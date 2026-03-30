/**
 * dc-browser
 *
 * Browser-compatible polyfill for Node.js diagnostics_channel.
 * Matches the API from Node.js core exactly.
 */

import { Channel, type MessageFunction } from "./channel";
import { channel, hasSubscribers } from "./channel-api";
import { TracingChannel, type Channels } from "./tracing-channel";

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

export { channel, hasSubscribers } from "./channel-api";

// Re-export classes
export { Channel, type TransformFunction, type MessageFunction } from "./channel";
export { TracingChannel, type ChannelHandlers } from "./tracing-channel";

// Default export mirrors Node.js CJS interop behaviour: when node:diagnostics_channel
// (a CJS module) is imported as ESM with `import dc from 'node:diagnostics_channel'`,
// Node.js exposes module.exports as the default.  Providing the same default export
// here lets code authored for that pattern work with dc-browser without changes.
export default {
  channel,
  hasSubscribers,
  subscribe,
  unsubscribe,
  tracingChannel,
  Channel,
  TracingChannel,
};
