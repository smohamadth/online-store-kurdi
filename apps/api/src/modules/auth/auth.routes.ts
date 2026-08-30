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
import { sendWelcomeEmail, sendPasswordResetEmail } from '../../services/email.service';
import { z } from 'zod';

const router = Router();

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
router.post('/register', async (req, res, next) => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);
    const { email, password, firstName, lastName, phone } = validatedData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

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
router.post('/login', async (req, res, next) => {
  try {
    // Validate request body
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
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
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

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
      // Include token in development for testing (the email may go to
      // MailHog, which is slower to check than the response body).
      // Never present in production.
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
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
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword },
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