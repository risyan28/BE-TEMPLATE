const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
p.user
  .findMany({ select: { id: true, username: true } })
  .then((u) => console.log(JSON.stringify(u, null, 2)))
  .finally(() => p.$disconnect())
