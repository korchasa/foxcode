import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export function register(email: string, name: string) {
  return prisma.user.create({
    data: { email, name },
  });
}
