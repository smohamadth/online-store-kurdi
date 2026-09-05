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
  // Boundary hardening, applied BEFORE any branch: no CR/LF or control
  // char may reach the SMTP headers (or the log-only line that mirrors
  // them), no matter where the subject came from.
  const safeSubject = sanitizeSubject(subject);
  const safeTo = to.replace(/[\x00-\x1f\x7f]/g, '');
  if (!safeTo) return false;

  try {
    if (!transporter) {
      logger.info(`📧 Email would be sent to ${safeTo}: ${safeSubject}`);
      return true;
    }

    const mailOptions = {
      from: env.EMAIL_FROM,
      to: safeTo,
      subject: safeSubject,
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

/** HTML-escape a value interpolated into an email body. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

/**
 * Render a template with variables.
 *
 * HTML content: values are HTML-escaped so a customer named
 * `<img src=x onerror=...>` (or a product carrying markup) cannot inject
 * markup into the email body.
 */
export function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, escapeHtml(value));
  });

  return rendered;
}

/**
 * Render a SUBJECT with variables: values are stripped of CR/LF and other
 * control characters, so a customer-controlled firstName can never inject
 * SMTP headers through a custom subject template (header injection).
 */
export function renderSubject(template: string, variables: Record<string, any>): string {
  let rendered = template;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, String(value).replace(/[\x00-\x1f\x7f]/g, ''));
  });

  return rendered;
}

/** Strip CR/LF and other control chars from an outgoing subject. */
function sanitizeSubject(subject: string): string {
  return subject.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

// ============================================
// EMAIL TEMPLATES
// ============================================

// Order confirmation email
export async function sendOrderConfirmation(order: any, user: any): Promise<void> {
  const template = await getTemplate('order_confirmation');
  // Same contract as payment/refund: a merchant template with
  // {{orderNumber}} / {{customerName}} in the subject must render, not
  // go out as the literal "{{orderNumber}}" (which is what the log-only
  // path was sending after the email-template seed).
  const variables = {
    customerName: user.firstName,
    orderNumber: order.orderNumber,
    orderTotal: Number(order.totalAmount || 0).toFixed(2),
    orderDate: new Date(order.createdAt).toLocaleDateString(),
    storeName: 'Online Store',
  };
  const subject = template
    ? renderSubject(template.subject, variables)
    : `Order Confirmation #${order.orderNumber}`;

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
          <p>Hi ${escapeHtml(user.firstName)},</p>
          <p>Thank you for your order! We're processing it now.</p>
          
          <div class="order-info">
            <h3>Order #${order.orderNumber}</h3>
            <p>Date: ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p>Status: ${order.status}</p>
          </div>
          
          <h3>Order Items</h3>
          ${order.items?.map((item: any) => `
            <div class="item">
              <span>${escapeHtml(item.product?.name || item.name)} x ${item.quantity}</span>
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
                <strong>${escapeHtml(d.productName)}</strong>
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
    ? renderTemplate(template.htmlContent, variables)
    : defaultHtml;

  await sendEmail(user.email, subject, html);
}

// Payment confirmation email.
//
// Sent when an order transitions to paid — which for Cash on Delivery /
// bank transfer happens when staff records the collected payment
// (POST /api/payments/process), and for hosted gateways when the gateway
// verifies the payment (webhook / return-verify). The order was already
// confirmed at placement; this email is the "we received your payment"
// acknowledgement, so the total/payment method are the key facts.
export async function sendPaymentConfirmation(order: any, user: any): Promise<void> {
  const template = await getTemplate('payment_confirmation');
  // Variables shared by the subject and the HTML body, so a merchant's
  // custom {{orderNumber}} in the subject renders the real value too.
  const variables = {
    customerName: user.firstName,
    orderNumber: order.orderNumber,
    orderTotal: Number(order.totalAmount || 0).toFixed(2),
    paymentMethod: order.paymentMethod || 'Online payment',
    orderUrl: `${env.FRONTEND_URL}/account/orders/${order.id}`,
    storeName: 'Online Store',
  };
  const subject = template
    ? renderSubject(template.subject, variables)
    : `Payment Received for Order #${order.orderNumber}`;

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #16a34a; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .pay-info { background: #f0fdf4; padding: 15px; border-radius: 5px; border: 1px solid #86efac; margin: 15px 0; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; }
        .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Received ✅</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(user.firstName)},</p>
          <p>Thank you! We have received your payment for order <strong>#${order.orderNumber}</strong>.</p>

          <div class="pay-info">
            <div class="row"><span>Order</span><span>#${order.orderNumber}</span></div>
            <div class="row"><span>Amount paid</span><span>$${Number(order.totalAmount || 0).toFixed(2)}</span></div>
            <div class="row"><span>Payment method</span><span>${escapeHtml(order.paymentMethod || 'Online payment')}</span></div>
          </div>

          <p>Your order is now being prepared. We'll email you the moment it ships.</p>

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

  const html = template ? renderTemplate(template.htmlContent, variables) : defaultHtml;

  await sendEmail(user.email, subject, html);
}

export async function sendRefundConfirmation(
  order: any,
  user: any,
  reason?: string,
  refundedAmount?: number,
  opts?: { toStoreCredit?: boolean },
): Promise<void> {
  const toStoreCredit = opts?.toStoreCredit === true;
  const template = await getTemplate('refund_confirmation');
  // Variables shared by the subject and the HTML body, so a merchant's
  // custom {{orderNumber}} in the subject renders the real value too.
  const variables = {
    customerName: user.firstName,
    orderNumber: order.orderNumber,
    // The actual amount refunded this time (a partial refund should report
    // that slice, not the whole order total).
    refundAmount: Number(refundedAmount ?? order.totalAmount ?? 0).toFixed(2),
    reason: reason || order.refundReason || 'Requested by the store',
    orderUrl: `${env.FRONTEND_URL}/account/orders/${order.id}`,
    storeName: 'Online Store',
    // 'store credit' vs 'original payment method' — custom templates can
    // branch on it so a credit refund is never described as a cash refund.
    refundMethod: toStoreCredit ? 'store credit' : 'original payment method',
  };
  const subject = template
    ? renderSubject(template.subject, variables)
    : toStoreCredit
      ? `Store Credit Added for Order #${order.orderNumber}`
      : `Refund Issued for Order #${order.orderNumber}`;

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${toStoreCredit ? '#16a34a' : '#dc2626'}; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .refund-info { background: ${toStoreCredit ? '#f0fdf4' : '#fef2f2'}; padding: 15px; border-radius: 5px; border: 1px solid ${toStoreCredit ? '#bbf7d0' : '#fecaca'}; margin: 15px 0; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; }
        .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${toStoreCredit ? 'Store Credit Added' : 'Refund Issued'}</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(user.firstName)},</p>
          ${
            toStoreCredit
              ? `<p>We have credited <strong>$${variables.refundAmount}</strong> to your store credit balance for order <strong>#${order.orderNumber}</strong>. The credit is already available — apply it automatically at checkout on your next order.</p>`
              : `<p>We have issued a refund for order <strong>#${order.orderNumber}</strong>. The money is on its way back to your original payment method.</p>`
          }

          <div class="refund-info">
            <div class="row"><span>Order</span><span>#${order.orderNumber}</span></div>
            <div class="row"><span>${toStoreCredit ? 'Credit amount' : 'Refund amount'}</span><span>$${variables.refundAmount}</span></div>
            <div class="row"><span>Paid back via</span><span>${toStoreCredit ? 'Store credit (available now)' : 'Original payment method'}</span></div>
            <div class="row"><span>Reason</span><span>${escapeHtml(variables.reason)}</span></div>
          </div>

          ${
            toStoreCredit
              ? '<p>You can use the credit on any future order — no code needed. It is applied in the Wallet Credit section at checkout.</p>'
              : '<p>Please allow a few business days for your bank or payment provider to process the refund.</p>'
          }

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

  const html = template ? renderTemplate(template.htmlContent, variables) : defaultHtml;

  await sendEmail(user.email, subject, html);
}
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
          <p>Hi ${escapeHtml(user.firstName)},</p>
          <p>Great news! Your order #${order.orderNumber} has been shipped.</p>
          
          <div class="tracking">
            <h3>Tracking Information</h3>
            <p><strong>Tracking Number:</strong> ${escapeHtml(trackingNumber)}</p>
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
          <p>Hi ${escapeHtml(user.firstName)},</p>
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
          <p>Hi ${escapeHtml(user.firstName)},</p>
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
  sendPaymentConfirmation,
  sendShippingNotification,
  sendWelcomeEmail,
  sendPasswordResetEmail,
};

/**
 * Abandoned-cart recovery email.
 *
 * Marketing mail, not transactional: it MUST carry a working one-click
 * unsubscribe link, both because CAN-SPAM/GDPR require it and because the
 * alternative is spam complaints that damage delivery of the store's
 * order confirmations too.
 */
export async function sendAbandonedCartEmail(params: {
  to: string;
  firstName?: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
  cartValue: number;
  cartUrl: string;
  unsubscribeUrl: string;
  stage: number;
}): Promise<boolean> {
  const { to, firstName, items, cartValue, cartUrl, unsubscribeUrl, stage } = params;

  const subject = stage === 1
    ? 'You left something in your cart'
    : 'Still thinking it over?';

  const rows = items.map((i) => `
    <tr>
      <td style="padding:8px 0;">${escapeHtml(i.name)} &times; ${Number(i.quantity) || 0}</td>
      <td style="padding:8px 0; text-align:right;">${(Number(i.price) || 0).toFixed(2)}</td>
    </tr>`).join('');

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
        .footer { font-size: 12px; color: #777; padding: 16px 20px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Your cart is waiting</h1></div>
        <div class="content">
          <p>Hi ${escapeHtml(firstName || 'there')},</p>
          <p>You left these items in your cart:</p>
          <table style="width:100%; border-collapse:collapse;">${rows}</table>
          <p style="text-align:right; font-weight:bold; margin-top:12px;">
            Total: ${(Number(cartValue) || 0).toFixed(2)}
          </p>
          <p style="text-align:center; margin-top:30px;">
            <a class="button" href="${escapeHtml(cartUrl)}">Complete your order</a>
          </p>
        </div>
        <div class="footer">
          <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from these reminders</a>
        </div>
      </div>
    </body>
    </html>`;

  const text = [
    `Hi ${firstName || 'there'},`,
    '',
    'You left these items in your cart:',
    ...items.map((i) => `  - ${i.name} x ${i.quantity}`),
    '',
    `Total: ${(Number(cartValue) || 0).toFixed(2)}`,
    `Complete your order: ${cartUrl}`,
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  return sendEmail(to, subject, html, text);
}
