// ---------------------------------------------------------------------------
// Transactional email (nodemailer/SMTP).
//
// LOG-ONLY FALLBACK: if no SMTP server is reachable at startup the
// transporter stays undefined and sendEmail() logs the email instead of
// sending - every email in the store must survive a deployment without
// an SMTP server (CI runs in exactly that mode, using MailHog or
// nothing). isEmailConfigured() exists so UIs that promise delivery
// (the admin test-email button) can say the truth.
//
// Templates live in the EmailTemplate table (admin-editable under
// /api/settings/email-templates); the built-in subject/HTML below are
// the defaults used when no template row is active.
//
// All senders below are fire-and-forget at their call sites
// (`.catch(log)`), so an email failure never fails the order/login it
// accompanies.
// ---------------------------------------------------------------------------
import nodemailer from 'nodemailer';
import { env } from '../config/environment';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

// Email transporter
let transporter: nodemailer.Transporter;

// Initialize email service
export async function initializeEmail(): Promise<void> {
  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: parseInt(env.SMTP_PORT),
      secure: false,
      auth: env.SMTP_USER ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      } : undefined,
    });

    // Verify connection
    await transporter.verify();
    logger.info('✅ Email service initialized');
  } catch (error) {
    logger.warn('⚠️ Email service not available - emails will be logged only');
  }
}

/**
 * True when a real SMTP transporter is available. In log-only mode
 * (no reachable SMTP server) `sendEmail` still succeeds, so callers
 * that must be honest with the user — like the admin test-email
 * button — check this to say "logged" instead of "delivered".
 */
export function isEmailConfigured(): boolean {
  return Boolean(transporter);
}

// Send email
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  try {
    if (!transporter) {
      logger.info(`📧 Email would be sent to ${to}: ${subject}`);
      return true;
    }

    const mailOptions = {
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`📧 Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
}

// Get email template from database
async function getTemplate(name: string): Promise<{ subject: string; htmlContent: string } | null> {
  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { name, isActive: true },
    });

    if (template) {
      return {
        subject: template.subject,
        htmlContent: template.htmlContent,
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Render template with variables
function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, String(value));
  });

  return rendered;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

// Order confirmation email
export async function sendOrderConfirmation(order: any, user: any): Promise<void> {
  const template = await getTemplate('order_confirmation');
  
  const subject = template?.subject || `Order Confirmation #${order.orderNumber}`;

  // The downloads array is set by the orders route when the order
  // contains a digital line item. The route passes a stamp of
  // { productName, token, url, expiresAt, downloadLimit } so
  // the email can render a "Download" button per digital line
  // without a second query here.
  const downloads: Array<{
    productName: string;
    token: string;
    url: string;
    expiresAt?: Date | null;
    downloadLimit?: number | null;
  }> = Array.isArray(order.downloads) ? order.downloads : [];
  
  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .order-info { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .total { font-size: 18px; font-weight: bold; margin-top: 15px; }
        .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
        .download { background: #eef6ff; border: 1px solid #93c5fd; border-radius: 5px; padding: 15px; margin: 10px 0; }
        .download .meta { color: #555; font-size: 12px; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hi ${user.firstName},</p>
          <p>Thank you for your order! We're processing it now.</p>
          
          <div class="order-info">
            <h3>Order #${order.orderNumber}</h3>
            <p>Date: ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p>Status: ${order.status}</p>
          </div>
          
          <h3>Order Items</h3>
          ${order.items?.map((item: any) => `
            <div class="item">
              <span>${item.product?.name || item.name} x ${item.quantity}</span>
              <span>$${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          `).join('') || ''}
          
          <div class="order-info">
            <div class="item"><span>Subtotal</span><span>$${order.subtotal}</span></div>
            ${order.discountAmount > 0 ? `<div class="item"><span>Discount</span><span>-$${order.discountAmount}</span></div>` : ''}
            <div class="item"><span>Shipping</span><span>${order.shippingAmount === 0 ? 'Free' : '$' + order.shippingAmount}</span></div>
            <div class="item"><span>Tax</span><span>$${order.taxAmount}</span></div>
            <div class="item total"><span>Total</span><span>$${order.totalAmount}</span></div>
          </div>
          
          ${downloads.length > 0 ? `
            <h3>Your downloads</h3>
            <p>Your digital purchases are ready. Use the buttons below to download each file.</p>
            ${downloads.map((d) => `
              <div class="download">
                <strong>${d.productName}</strong>
                <div style="margin-top: 8px;">
                  <a href="${d.url}" class="button">Download</a>
                </div>
                <div class="meta">
                  ${d.expiresAt ? `Expires ${new Date(d.expiresAt).toLocaleDateString()}` : 'No expiry'}
                  ${d.downloadLimit ? `&middot; Up to ${d.downloadLimit} downloads` : ''}
                </div>
              </div>
            `).join('')}
            <p style="font-size: 12px; color: #666; margin-top: 12px;">
              You can always find your downloads at
              <a href="${env.FRONTEND_URL}/account/downloads">${env.FRONTEND_URL}/account/downloads</a>.
            </p>
          ` : ''}
          
          ${order.shippingAddress ? `
            <h3>Shipping Address</h3>
            <p>
              ${order.shippingAddress.firstName} ${order.shippingAddress.lastName}<br>
              ${order.shippingAddress.address}<br>
              ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipCode}<br>
              ${order.shippingAddress.country}
            </p>
          ` : ''}
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${env.FRONTEND_URL}/account/orders/${order.id}" class="button">View Order</a>
          </p>
          
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            If you have any questions, please contact us at ${env.EMAIL_FROM}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const html = template 
    ? renderTemplate(template.htmlContent, {
        customerName: user.firstName,
        orderNumber: order.orderNumber,
        orderTotal: order.totalAmount,
        orderDate: new Date(order.createdAt).toLocaleDateString(),
        storeName: 'Online Store',
      })
    : defaultHtml;

  await sendEmail(user.email, subject, html);
}

// Shipping notification email
export async function sendShippingNotification(order: any, user: any, trackingNumber: string): Promise<void> {
  const subject = `Your Order #${order.orderNumber} Has Shipped!`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .tracking { background: #f0fdf4; padding: 15px; border-radius: 5px; border: 1px solid #22c55e; margin: 15px 0; }
        .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your Order Has Shipped! 🚚</h1>
        </div>
        <div class="content">
          <p>Hi ${user.firstName},</p>
          <p>Great news! Your order #${order.orderNumber} has been shipped.</p>
          
          <div class="tracking">
            <h3>Tracking Information</h3>
            <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${env.FRONTEND_URL}/account/orders/${order.id}" class="button">Track Order</a>
          </p>
          
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            If you have any questions, please contact us at ${env.EMAIL_FROM}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail(user.email, subject, html);
}

// Welcome email
export async function sendWelcomeEmail(user: any): Promise<void> {
  const subject = 'Welcome to Our Store!';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome! 🎉</h1>
        </div>
        <div class="content">
          <p>Hi ${user.firstName},</p>
          <p>Welcome to our store! We're excited to have you.</p>
          <p>Start exploring our products and find something you love.</p>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${env.FRONTEND_URL}/products" class="button">Start Shopping</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail(user.email, subject, html);
}

// Password reset email
export async function sendPasswordResetEmail(user: any, resetToken: string): Promise<void> {
  const subject = 'Reset Your Password';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset</h1>
        </div>
        <div class="content">
          <p>Hi ${user.firstName},</p>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${env.FRONTEND_URL}/reset-password?token=${resetToken}" class="button">Reset Password</a>
          </p>
          
          <p style="margin-top: 20px; color: #666; font-size: 14px;">
            If you didn't request this, please ignore this email. The link will expire in 1 hour.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail(user.email, subject, html);
}

export default {
  initializeEmail,
  sendEmail,
  sendOrderConfirmation,
  sendShippingNotification,
  sendWelcomeEmail,
  sendPasswordResetEmail,
};