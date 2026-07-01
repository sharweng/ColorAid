/**
 * Seed Admin Script
 * Usage: npx ts-node scripts/seedAdmin.ts --email admin@example.com --password YourPassword123!
 *
 * Creates or updates a user with role="admin" and isActive=true.
 * Safe to re-run — uses upsert on email.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = getArg('--email');
  const password = getArg('--password');
  const username = getArg('--username') ?? 'admin';

  if (!email || !password) {
    console.error('Usage: npx ts-node scripts/seedAdmin.ts --email <email> --password <password> [--username <username>]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: 'admin', isActive: true, passwordHash },
    create: {
      email: email.toLowerCase(),
      username,
      passwordHash,
      role: 'admin',
      isActive: true,
    },
    select: { id: true, email: true, username: true, role: true, isActive: true },
  });

  console.log('\n✅ Admin account ready:');
  console.table(user);
}

main()
  .catch(err => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
