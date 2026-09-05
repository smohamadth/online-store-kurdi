// Resolve the singleton StoreSettings row (id = 'default').
//
// GET /api/settings used to findUnique then create. Two storefront
// widgets hitting an empty table at once both saw "missing" and both
// created, so the second request 409'd (unique on id). Upsert is one
// round-trip; if the adapter still surfaces P2002 we re-read the row
// the other request wrote.

export async function ensureDefaultSettings<
  TClient extends {
    storeSettings: {
      findUnique: (args: { where: { id: string } }) => Promise<any>;
      upsert: (args: {
        where: { id: string };
        update: Record<string, never>;
        create: { id: string };
      }) => Promise<any>;
    };
  },
>(prisma: TClient) {
  let settings = await prisma.storeSettings.findUnique({
    where: { id: 'default' },
  });
  if (settings) return settings;

  try {
    settings = await prisma.storeSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err;
    settings = await prisma.storeSettings.findUnique({
      where: { id: 'default' },
    });
    if (!settings) throw err;
  }
  return settings;
}
