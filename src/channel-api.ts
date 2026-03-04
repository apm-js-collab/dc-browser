import { Channel } from "./channel";
import { getChannelIfExists, getOrCreateChannel } from "./channel-registry";

/**
 * Get or create a channel by name.
 * Matches Node.js channel() API.
 */
export function channel<M>(name: string): Channel<M, string>;
export function channel<M>(name: symbol): Channel<M, symbol>;
export function channel<M, N extends string | symbol>(name: N): Channel<M, N> {
  if (typeof name !== "string" && typeof name !== "symbol") {
    throw new TypeError("channel name must be a string or symbol");
  }
  return getOrCreateChannel(name);
}

/**
 * Check if a channel has subscribers.
 * Matches Node.js hasSubscribers() API.
 */
export function hasSubscribers(name: string | symbol): boolean {
  const ch = getChannelIfExists(name);
  return ch ? ch.hasSubscribers : false;
}
