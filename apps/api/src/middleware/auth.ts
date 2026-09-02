// ---------------------------------------------------------------------------
// JWT authentication + role authorization - the middleware pair most
// routes are built from:
//
//   authenticate  - Bearer token -> verify -> load user -> req.user.
//                   Also rejects DEACTIVATED accounts (a revoked user's
//                   still-valid token must not work).
//   optionalAuth  - same, but a missing/invalid token is simply ignored
//                   (routes that personalise when logged in).
//   authorize     - role gate, used AFTER authenticate.
//
// generateTokens/verifyRefreshToken implement the token pair: short
// stateless access tokens + long-lived refresh tokens with a unique jti
// (the refresh half is session-backed and rotated - see auth.routes.ts).
// ---------------------------------------------------------------------------
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/environment';
import { prisma } from '../config/database';
import { UnauthorizedError, ForbiddenError } from './errorHandler';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        firstName: string;
        lastName: string;
      };
    }
  }
}

// JWT payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  // Refresh tokens carry type + jti (see generateTokens); access tokens
  // do not, hence optional.
  type?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

// Authentication middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

    // An access token must not be a refresh token: refresh tokens are
    // long-lived (30d) and session-rotated, so accepting one here would
    // let a stolen refresh token be used directly as an access token,
    // bypassing the rotation/replay detection on /auth/refresh.
    if (decoded.type === 'refresh') {
      throw new UnauthorizedError('Invalid token');
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('User account is deactivated');
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    logger.debug(`User authenticated: ${user.email}`);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

// Optional authentication middleware (doesn't throw error if no token)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

    // Same refresh-token rejection as authenticate: optionalAuth must not
    // treat a long-lived refresh token as an access token either.
    if (decoded.type === 'refresh') {
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    if (user && user.isActive) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Role-based authorization middleware
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`Authorization failed: User ${req.user.email} with role ${req.user.role} attempted to access restricted resource`);
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

// Generate JWT tokens
export const generateTokens = (user: { id: string; email: string; role: string }) => {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] }
  );

  // `jti` makes every refresh token unique.
  //
  // Without it the payload is only { userId, type } plus `iat`, which has
  // one-second resolution - so two logins inside the same second produced
  // BYTE-IDENTICAL tokens. Session.refreshToken is @unique, so the second
  // login failed with a Prisma P2002 surfaced as
  // "A record with this value already exists" (HTTP 409). Logging in twice
  // quickly, or two devices at once, could not sign in.
  const refreshToken = jwt.sign(
    {
      userId: user.id,
      type: 'refresh',
      jti: crypto.randomUUID(),
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] }
  );

  return { accessToken, refreshToken };
};

// Verify refresh token
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    
    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Invalid refresh token');
    }

    return decoded;
  } catch (error) {
    throw new UnauthorizedError('Invalid refresh token');
  }
};

export default authenticate;