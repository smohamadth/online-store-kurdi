// ---------------------------------------------------------------------------
// Unit tests for the optional Socket.IO Redis adapter (multi-instance
// real-time). The adapter must NEVER be a hard dependency: with Redis up it
// attaches and Socket.IO broadcasts across instances; without Redis it
// degrades to single-instance (in-memory) mode without throwing or blocking.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redis: {
    isReady: true,
    duplicate: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/config/redis', () => ({ redis: hoisted.redis }));
vi.mock('../../../src/utils/logger', () => ({ logger: hoisted.logger }));

import { attachSocketIOAdapter } from '../../../src/config/socketAdapter';

function fakeRedisClient() {
  return {
    connect: vi.fn(async () => {}),
    on: vi.fn(),
    pSubscribe: vi.fn(),
    subscribe: vi.fn(),
    publish: vi.fn(),
  };
}

function fakeIO() {
  // Behaves like Socket.IO's Server.adapter(factory): it constructs the
  // adapter for each namespace immediately, which is exactly what the real
  // server does — so this exercises the real @socket.io/redis-adapter
  // constructor (subscribe/pSubscribe/on calls) against our fake clients.
  const io = {
    adapter: vi.fn(),
  };
  io.adapter.mockImplementation((factory: (nsp: any) => unknown) => {
    // A minimal namespace: the real Adapter constructor reads
    // `nsp.server.encoder` to set up its packet encoder.
    factory({ name: '/', server: { encoder: {} } });
  });
  return io;
}

describe('attachSocketIOAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.redis.isReady = true;
    hoisted.redis.duplicate.mockReset();
  });

  it('attaches the Redis adapter when Redis is ready', async () => {
    const pub = fakeRedisClient();
    const sub = fakeRedisClient();
    hoisted.redis.duplicate.mockReturnValueOnce(pub).mockReturnValueOnce(sub);
    const io = fakeIO();

    const result = await attachSocketIOAdapter(io as any);

    expect(result).toBe(true);
    expect(hoisted.redis.duplicate).toHaveBeenCalledTimes(2);
    expect(pub.connect).toHaveBeenCalledTimes(1);
    expect(sub.connect).toHaveBeenCalledTimes(1);
    expect(io.adapter).toHaveBeenCalledTimes(1);
    // The real adapter constructor subscribes both channels on the sub
    // client and registers error handlers on both clients — proof the
    // wiring is valid, not just a stubbed no-op.
    expect(sub.pSubscribe).toHaveBeenCalled();
    expect(sub.subscribe).toHaveBeenCalled();
    expect(pub.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(hoisted.logger.info.mock.calls.some((c) => String(c[0]).includes('attached'))).toBe(true);
  });

  it('runs single-instance (no adapter) when Redis is not ready', async () => {
    hoisted.redis.isReady = false;
    const io = fakeIO();

    const result = await attachSocketIOAdapter(io as any, 0);

    expect(result).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
    expect(hoisted.redis.duplicate).not.toHaveBeenCalled();
  });

  it('runs single-instance (no adapter) when the duplicate connections fail', async () => {
    const pub = fakeRedisClient();
    pub.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    hoisted.redis.duplicate.mockReturnValueOnce(pub).mockReturnValueOnce(fakeRedisClient());
    const io = fakeIO();

    const result = await attachSocketIOAdapter(io as any);

    expect(result).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
    expect(hoisted.logger.warn.mock.calls.some((c) => String(c[0]).includes('single-instance'))).toBe(true);
  });

  it('never throws even when io.adapter itself throws', async () => {
    const pub = fakeRedisClient();
    const sub = fakeRedisClient();
    hoisted.redis.duplicate.mockReturnValueOnce(pub).mockReturnValueOnce(sub);
    const io = {
      adapter: vi.fn(() => {
        throw new Error('boom');
      }),
    };

    const result = await attachSocketIOAdapter(io as any);

    expect(result).toBe(false);
    expect(hoisted.logger.warn).toHaveBeenCalled();
  });
});
