// ---------------------------------------------------------------------------
// Socket.IO multi-instance adapter (optional, Redis-backed).
//
// Socket.IO keeps the list of connected clients in the memory of the process
// that owns the sockets. That is correct for a single API instance: a
// customer's "order shipped" push goes to the socket connected to that same
// process. With N instances behind a load balancer it breaks — a customer
// connected to instance A is invisible to instance B, so an event emitted on
// B never reaches them.
//
// The Redis adapter gives every instance a SHARED view of who is connected:
// an emit on any instance is published through Redis and delivered by
// whichever instance actually holds the target sockets. It is the standard
// fix (`@socket.io/redis-adapter`), and Redis is already an optional part of
// this codebase (config/redis.ts — caching, sessions). Exactly like that
// layer, the adapter is NEVER a hard dependency: when Redis is unreachable
// the server still boots and Socket.IO runs in single-instance (in-memory)
// mode, which is correct for the default one-server deployment.
// ---------------------------------------------------------------------------
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as SocketIOServer } from 'socket.io';
import { redis } from './redis';
import { logger } from '../utils/logger';

/**
 * Attach the Redis adapter to the Socket.IO server.
 *
 * Call AFTER `connectRedis()` has settled (that call is fire-and-forget at
 * boot; it resolves within ~2s either way). Resolves `true` when the adapter
 * is live (multi-instance real-time), `false` when Redis is unavailable and
 * Socket.IO runs single-instance. Never throws — a missing Redis must not
 * prevent boot.
 *
 * `waitForReadyMs` bounds how long we wait for the main client to finish
 * connecting (connectRedis gives up after 2s, so a slow-but-alive Redis may
 * still come up shortly after). Tests pass 0 to skip the wait.
 */
export async function attachSocketIOAdapter(
  io: SocketIOServer,
  waitForReadyMs: number = 5000,
): Promise<boolean> {
  try {
    // The main client is the source of truth for "is Redis reachable": if
    // it never came up, duplicates won't either. Give it a short bounded
    // grace period (it may still be mid-handshake), then bail instead of
    // letting the duplicates grind through their reconnect backoff.
    const deadline = Date.now() + waitForReadyMs;
    while (!redis.isReady && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!redis.isReady) {
      logger.warn('⚠️ Socket.IO: Redis not ready — running single-instance (in-memory) mode');
      return false;
    }

    // The adapter needs two connections: one to publish, one to subscribe.
    // duplicate() shares the parent's url + socket options (including the
    // bounded reconnect strategy) without touching the shared client.
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.IO Redis adapter attached (multi-instance real-time)');
    return true;
  } catch (err) {
    logger.warn(
      '⚠️ Socket.IO: Redis adapter unavailable — running single-instance (in-memory) mode:',
      err as Error,
    );
    return false;
  }
}
