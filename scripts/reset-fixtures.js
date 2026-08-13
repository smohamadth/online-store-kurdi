// Clears fixtures created by regression.sh so the suite is repeatable.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  await p.product.deleteMany({ where: { sku: { startsWith: 'REG-' } } });

  const users = await p.user.findMany({ where: { email: { startsWith: 'reg_probe' } } });
  for (const u of users) {
    const orders = await p.order.findMany({ where: { userId: u.id }, select: { id: true } });
    const ids = orders.map((o) => o.id);
    await p.payment.deleteMany({ where: { orderId: { in: ids } } });
    await p.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await p.order.deleteMany({ where: { userId: u.id } });
    await p.address.deleteMany({ where: { userId: u.id } });
    await p.review.deleteMany({ where: { userId: u.id } });
    await p.user.delete({ where: { id: u.id } });
  }
})()
  .catch((e) => console.error('fixture reset failed:', e.message))
  .finally(() => p.$disconnect());
