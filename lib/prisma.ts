import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  if (process.env.PRISMA_DEBUG_DATABASE_URL === "1") {
    const masked = databaseUrl.replace(
      /(postgres(?:ql)?:\/\/)([^:@]+)(?::[^@]*)?@/i,
      "$1$2:***@",
    );
    console.info("[prisma-runtime] DATABASE_URL =", masked);
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
