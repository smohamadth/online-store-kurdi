// Built-in email templates, seeded by prisma/seed.ts into the
// EmailTemplate table. These are the DEFAULTS the admin can override
// in the settings admin (PUT /api/settings/email-templates/:name);
// seedEmailTemplates() upserts by template `name` - note the update
// side writes the FULL built-in row, so re-running the seed RESETS a
// template the admin had edited (the admin re-applies edits after a
// re-seed, which only matters on a fresh install or explicit reseed).
//
// Variables use {{name}} placeholders that the senders in
// services/email.service.ts substitute (customerName, orderNumber,
// orderTotal, resetToken, ...).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const emailTemplates = [
  {
    name: 'order_confirmation',
    subject: 'Order Confirmation #{{orderNumber}}',
    htmlContent: `
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
            <h1>Order Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hi {{customerName}},</p>
            <p>Thank you for your order #{{orderNumber}}!</p>
            <p>Total: \${{orderTotal}}</p>
            <p>We'll send you shipping updates soon.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: 'Hi {{customerName}}, Thank you for your order #{{orderNumber}}! Total: ${{orderTotal}}',
    variables: JSON.stringify(['customerName', 'orderNumber', 'orderTotal', 'orderDate']),
    isActive: true,
  },
  {
    name: 'payment_confirmation',
    subject: 'Payment Received for Order #{{orderNumber}}',
    htmlContent: `
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
            <p>Hi {{customerName}},</p>
            <p>Thank you! We have received your payment for order <strong>#{{orderNumber}}</strong>.</p>
            <div class="pay-info">
              <div class="row"><span>Order</span><span>#{{orderNumber}}</span></div>
              <div class="row"><span>Amount paid</span><span>${{orderTotal}}</span></div>
              <div class="row"><span>Payment method</span><span>{{paymentMethod}}</span></div>
            </div>
            <p>Your order is now being prepared. We'll email you the moment it ships.</p>
            <p style="text-align: center; margin-top: 30px;">
              <a href="{{orderUrl}}" class="button">View Order</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: 'Hi {{customerName}}, Payment received for order #{{orderNumber}}! Amount: ${{orderTotal}}',
    variables: JSON.stringify(['customerName', 'orderNumber', 'orderTotal', 'paymentMethod', 'orderUrl']),
    isActive: true,
  },
  {
    name: 'shipping_notification',
    subject: 'Your Order #{{orderNumber}} Has Shipped!',
    htmlContent: `
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
            <h1>Your Order Has Shipped! 🚚</h1>
          </div>
          <div class="content">
            <p>Hi {{customerName}},</p>
            <p>Your order #{{orderNumber}} has been shipped!</p>
            <p>Tracking: {{trackingNumber}}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: 'Hi {{customerName}}, Your order #{{orderNumber}} has shipped! Tracking: {{trackingNumber}}',
    variables: JSON.stringify(['customerName', 'orderNumber', 'trackingNumber']),
    isActive: true,
  },
  {
    name: 'welcome',
    subject: 'Welcome to {{storeName}}!',
    htmlContent: `
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
            <p>Hi {{customerName}},</p>
            <p>Welcome to {{storeName}}! We're excited to have you.</p>
            <p><a href="{{storeUrl}}/products" class="button">Start Shopping</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: 'Hi {{customerName}}, Welcome to {{storeName}}!',
    variables: JSON.stringify(['customerName', 'storeName', 'storeUrl']),
    isActive: true,
  },
  {
    name: 'password_reset',
    subject: 'Reset Your Password',
    htmlContent: `
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
            <p>Hi {{customerName}},</p>
            <p>Click below to reset your password:</p>
            <p><a href="{{resetLink}}" class="button">Reset Password</a></p>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: 'Hi {{customerName}}, Reset your password: {{resetLink}}',
    variables: JSON.stringify(['customerName', 'resetLink']),
    isActive: true,
  },
  {
    name: 'abandoned_cart',
    subject: 'You left items in your cart!',
    htmlContent: `
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
            <h1>Complete Your Purchase!</h1>
          </div>
          <div class="content">
            <p>Hi {{customerName}},</p>
            <p>You have items waiting in your cart. Don't miss out!</p>
            <p><a href="{{cartUrl}}" class="button">Complete Purchase</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: 'Hi {{customerName}}, You have items in your cart. Complete your purchase: {{cartUrl}}',
    variables: JSON.stringify(['customerName', 'cartUrl']),
    isActive: true,
  },
];

export async function seedEmailTemplates() {
  console.log('📧 Seeding email templates...');

  for (const template of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { name: template.name },
      update: template,
      create: template,
    });
    console.log(`  ✅ ${template.name}`);
  }

  console.log('✅ Email templates seeded');
}

// Run if called directly
if (require.main === module) {
  seedEmailTemplates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}