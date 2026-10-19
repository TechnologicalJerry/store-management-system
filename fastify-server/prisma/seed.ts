import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent seed script for foundational system parameters.
 * Does not create demo users, credentials, or fake domain data.
 */
async function main(): Promise<void> {
  console.log('Seeding foundational system settings...');

  const initialSettings = [
    {
      key: 'system.initialized',
      value: { status: true, version: '1.0.0', stage: 2 },
      description: 'System initialization status flag',
      isReadOnly: true,
    },
    {
      key: 'system.app_name',
      value: 'Store Management System',
      description: 'Global application display name',
      isReadOnly: false,
    },
    {
      key: 'system.default_currency',
      value: 'USD',
      description: 'Default ISO currency code for financial transactions',
      isReadOnly: false,
    },
    {
      key: 'system.timezone',
      value: 'UTC',
      description: 'Default system-wide timezone for auditing and records',
      isReadOnly: false,
    },
  ];

  for (const setting of initialSettings) {
    const record = await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
        isReadOnly: setting.isReadOnly,
      },
      update: {
        description: setting.description,
      },
    });

    console.log(`- Seeded setting: ${record.key}`);
  }

  console.log('Foundational database seeding completed successfully.');
}

main()
  .catch(error => {
    console.error('CRITICAL: Seed execution failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
