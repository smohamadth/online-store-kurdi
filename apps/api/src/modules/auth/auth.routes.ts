// ---------------------------------------------------------------------------
// Auth: register / login / refresh / logout / me / password reset.
//
// Session model: every login (or register) mints a refresh token with a
// unique jti and stores it in the Session table (unique on refreshToken).
// Refresh ROTATES the token (new access + new refresh, old one replaced),
// so a stolen refresh token is single-use. Access tokens are stateless
// JWTs checked by the authenticate middleware on every request.
//
// Security notes baked in below: login errors never reveal which half
// failed ("Invalid email or password"), forgot-password never reveals
// whether an account exists, and a successful password reset kills every
// existing session for that user.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { generateTokens, verifyRefreshToken, authenticate } from '../../middleware/auth';
import { AppError, UnauthorizedError, ConflictError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import {
  recordAuthFailure,
  isAuthLocked,
  clearAuthFailures,
  pruneAuthFailures,
} from '../../utils/authThrottle';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../../services/email.service';
import { emit } from '../plugins/pluginHooks';
import { exposeResetToken } from '../../config/environment';
import { z } from 'zod';

const router = Router();

// Emails are case-insensitive identifiers: 'User@X.com' and 'user@x.com'
// are the same mailbox, so every write stores the lowercase form and
// every read resolves the exact value first, then the normalized form,
// then a case-insensitive scan for legacy rows registered before
// normalization (e.g. 'LegacyCase@test.local'). SQLite LIKE is ASCII
// case-insensitive, so `contains` finds those rows; the exact JS equality
// check below rules out substring false positives from LIKE wildcards.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findUserByEmail(email: string): Promise<any> {
  const normalized = normalizeEmail(email);

  // Fast path: exact match (also covers already-lowercase inputs).
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;

  // The normalized form (covers uppercase input against a lowercase row).
  if (normalized !== email) {
    const norm = await prisma.user.findUnique({ where: { email: normalized } });
    if (norm) return norm;
  }

  // Legacy rows with mixed case stored before normalization.
  const candidates = await prisma.user.findMany({
    where: { email: { contains: normalized } },
  });
  return candidates.find((u: any) => u.email.toLowerCase() === normalized) ?? null;
}

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register
// authz-ok: public sign-up; abuse-limited by authThrottle
router.post('/register', async (req, res, next) => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);
    const { password, firstName, lastName, phone } = validatedData;
    // Normalize so 'User@X.com' and 'user@x.com' can never be two accounts.
    const email = normalizeEmail(validatedData.email);

    // Check if user already exists (legacy-aware: a mixed-case row from
    // before normalization must still block the same mailbox).
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password (cost 12; CI drops to 10 via BCRYPT_ROUNDS for speed)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role: 'customer',
        // This store has no email-verification flow: self-registration IS
        // verification. The schema defaults to false, so without this every
        // registered account would be indistinguishable from an unverified
        // imported one (and the login isVerified guard would lock everyone
        // out). Imported (bulk) accounts are the deliberate exception - they
        // stay false until the customer activates via forgot-password.
        isVerified: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Store refresh token
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    logger.info(`User registered: ${user.email}`);

    // Plugin event: customer.registered (fire-and-forget — emit never throws).
    void emit('customer.registered', {
      customerId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail({ firstName: user.firstName, email: user.email }).catch(err => {
      logger.error('Failed to send welcome email:', err);
    });

    res.status(201).json({
      status: 'success',
      data: {
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
// authz-ok: public sign-in; abuse-limited by authThrottle
router.post('/login', async (req, res, next) => {
  try {
    // Brute-force throttle BEFORE any bcrypt work: bcrypt.compare is
    // deliberately expensive, so an unthrottled attacker burns CPU per
    // attempt and grinds through passwords with no back-off. The email
    // key is the attempted string (lowercased), never account state —
    // unknown emails lock out exactly like known ones, so the lockout
    // cannot be used to probe which accounts exist.
    pruneAuthFailures();
    const attemptEmail = String(req.body?.email || '').trim().toLowerCase();
    const ip = req.ip || 'unknown';
    if (isAuthLocked('email', attemptEmail) || isAuthLocked('ip', ip)) {
      throw new UnauthorizedError(
        'Too many failed attempts. Try again in about 15 minutes.',
      );
    }

    // Validate request body
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    // Find user (exact first, then lowercase for legacy rows)
    const user = await findUserByEmail(email);

    if (!user) {
      // Count against the attempted identity too: if only existing
      // emails were counted, a probe could distinguish real accounts.
      recordAuthFailure('email', attemptEmail);
      recordAuthFailure('ip', ip);
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Count the failure (identity + IP). Same message as the
      // unknown-user branch above so the two cannot be distinguished.
      recordAuthFailure('email', attemptEmail);
      recordAuthFailure('ip', ip);
      throw new UnauthorizedError('Invalid email or password');
    }

    // Successful login: clear both counters for this identity.
    clearAuthFailures('email', attemptEmail);

    // Imported accounts (bulk customer/order import) are created unverified
    // with a random password; the forgot-password flow activates them. Check
    // AFTER the password compare so this branch is only reachable by someone
    // who already knows the credentials — it never leaks account state to a
    // password-guessing probe.
    if (!user.isVerified) {
      throw new UnauthorizedError(
        'Account is not verified yet. Use the forgot-password flow to set your password and activate the account.',
      );
    }

    // Generate tokens (the refresh token's jti makes it unique per login -
    // see the note in middleware/auth.ts about the P2002 bug that motivated it)
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Store refresh token - Session rows are what let "logout everywhere"
    // and password-reset kill existing logins.
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    logger.info(`User logged in: ${user.email}`);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      status: 'success',
      data: {
        user: userWithoutPassword,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh - token ROTATION: the old refresh token is
// replaced by a new one in the same Session row. A replayed (already
// rotated) token finds no Session and gets 401, which is how the client
// knows it must log in again.
// authz-ok: the refresh token itself is the credential
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find session
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    if (session.expiresAt < new Date()) {
      // Delete expired session
      await prisma.session.delete({
        where: { id: session.id },
      });
      throw new UnauthorizedError('Refresh token expired');
    }

    // Generate new tokens
    const tokens = generateTokens({
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    });

    // Update session with new refresh token
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    res.json({
      status: 'success',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Delete specific session
      await prisma.session.deleteMany({
        where: {
          userId: req.user?.id,
          refreshToken,
        },
      });
    } else {
      // Delete all sessions for user
      await prisma.session.deleteMany({
        where: { userId: req.user?.id },
      });
    }

    logger.info(`User logged out: ${req.user?.email}`);

    res.json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        addresses: true,
        _count: {
          select: {
            orders: true,
            reviews: true,
            wishlist: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password
// authz-ok: public; password reset must work without a session
router.post('/forgot-password', async (req, res, next) => {
  // Per-email + per-IP cap: the endpoint mints a reset token and emails
  // it, so an unthrottled flood both spams a mailbox and writes a
  // passwordReset row per request. The response is the same either
  // way, so the throttle cannot be used to probe account existence.
  const forgotEmail = String(req.body?.email || '').trim().toLowerCase();
  const forgotIp = req.ip || 'unknown';
  if (isAuthLocked('email', forgotEmail) || isAuthLocked('ip', forgotIp)) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests. Try again in about 15 minutes.',
    });
  }
  recordAuthFailure('email', forgotEmail);
  recordAuthFailure('ip', forgotIp);
  try {
    const { email } = req.body;

    // Find user (exact first, then lowercase for legacy rows)
    const user = await findUserByEmail(email);

    // Don't reveal if user exists or not
    const successMessage = 'If an account exists with this email, you will receive a password reset link';

    if (!user) {
      return res.json({
        status: 'success',
        message: successMessage,
      });
    }

    // Invalidate any existing reset tokens for this user
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id },
    });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in database
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt,
      },
    });

    // Send password reset email (non-blocking)
    sendPasswordResetEmail(user, resetToken).catch(err => {
      logger.error('Failed to send password reset email:', err);
    });

    logger.info(`Password reset token generated for: ${email}`);

    res.json({
      status: 'success',
      message: successMessage,
      // Echo the reset token back only when a developer has EXPLICITLY opted
      // in with EXPOSE_RESET_TOKEN=true (handy when the mail goes to MailHog).
      //
      // This used to key off `NODE_ENV === 'development'`. NODE_ENV defaults
      // to 'development' (config/environment.ts), so any deployment that did
      // not explicitly set NODE_ENV=production handed a valid password-reset
      // token for ANY email address to an unauthenticated caller - account
      // takeover for every user, on an endpoint that otherwise takes care not
      // even to reveal whether an account exists. An opt-in flag cannot be
      // switched on by an ambient default, and it is refused in production
      // regardless (see config/environment.ts).
      ...(exposeResetToken() && { resetToken }),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password
// authz-ok: the emailed reset token is the credential
router.post('/reset-password', async (req, res, next) => {
  // The reset endpoint runs a bcrypt hash on a guessable token, so it
  // is a guessing target too; cap attempts per IP. (No per-email key:
  // the token is a random 32-byte value, and the request doesn't carry
  // the email.)
  const resetIp = req.ip || 'unknown';
  if (isAuthLocked('ip', resetIp)) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests. Try again in about 15 minutes.',
    });
  }
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Token and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters',
      });
    }

    // Find and validate reset token
    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord) {
      recordAuthFailure('ip', resetIp);
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token',
      });
    }

    if (resetRecord.used) {
      return res.status(400).json({
        status: 'error',
        message: 'This reset token has already been used',
      });
    }

    if (resetRecord.expiresAt < new Date()) {
      // Delete expired token
      await prisma.passwordReset.delete({
        where: { id: resetRecord.id },
      });
      return res.status(400).json({
        status: 'error',
        message: 'Reset token has expired. Please request a new one.',
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password and mark token as used - one transaction so the
    // token can never be "used" without the password actually changing.
    // isVerified: true — a successful reset is the activation path for
    // imported (unverified) accounts; without it they could never log in.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword, isVerified: true },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
      // Invalidate all existing sessions for security
      prisma.session.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    logger.info(`Password reset completed for user: ${resetRecord.user.email}`);

    res.json({
      status: 'success',
      message: 'Password reset successfully. Please login with your new password.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;