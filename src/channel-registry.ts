import { Channel } from "./channel";

type ChannelName = string | symbol;
type AnyChannel = Channel<any, any>;

// Symbol key for storing the channels map on globalThis to avoid dual-package hazard.
const CHANNELS_KEY = Symbol.for("dc-browser:channels");

// Store on globalThis to share between ESM and CJS builds.
const channels: Map<ChannelName, AnyChannel> =
  (globalThis as any)[CHANNELS_KEY] ||
  ((globalThis as any)[CHANNELS_KEY] = new Map<ChannelName, AnyChannel>());

export function getOrCreateChannel<M, N extends ChannelName>(name: N): Channel<M, N> {
  let ch = channels.get(name);
  if (!ch) {
    ch = new Channel(name);
    channels.set(name, ch);
  }
  return ch as Channel<M, N>;
}

export function getChannelIfExists<M, N extends ChannelName>(name: N): Channel<M, N> | undefined {
  return channels.get(name) as Channel<M, N> | undefined;
}

// Test-only helper for deterministic isolation.
export function resetChannelRegistryForTest(): void {
  channels.clear();
}
