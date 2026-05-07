'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

const SEED_USERS = [
  { email: 'admin@securebackup.local', password: 'Admin@1234!', role: 'admin' },
  { email: 'responsable@securebackup.local', password: 'Resp@1234!', role: 'responsable' },
  { email: 'auditeur@securebackup.local', password: 'Audit@1234!', role: 'auditeur' },
];

async function main() {
  for (const u of SEED_USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  ⏭  ${u.email} existe déjà (rôle: ${existing.role})`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 12);
    await db.user.create({ data: { email: u.email, passwordHash, role: u.role } });
    console.log(`  ✓  ${u.email} créé (rôle: ${u.role}, mot de passe: ${u.password})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
