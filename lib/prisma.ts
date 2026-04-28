import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function hasConnectedAccountMetadataField(client: PrismaClient): boolean {
  try {
    const runtimeDataModel = (client as unknown as { _runtimeDataModel?: unknown })._runtimeDataModel as
      | {
          models?: Record<string, { fields?: Array<{ name?: string }> }>;
        }
      | undefined;
    const fields = runtimeDataModel?.models?.ConnectedAccount?.fields ?? [];
    return fields.some((field) => field?.name === "metadataJson");
  } catch {
    return false;
  }
}

function hasRequiredDelegates(client: PrismaClient): boolean {
  const raw = client as unknown as Record<string, unknown>;
  return Boolean(raw.scheduledPost && raw.postHistory && (raw.connectedAccount || raw.connectedAccounts));
}

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

function getPrismaClient() {
  if (globalForPrisma.prisma) {
    const cachedClient = globalForPrisma.prisma;
    if (hasRequiredDelegates(cachedClient) && hasConnectedAccountMetadataField(cachedClient)) {
      return globalForPrisma.prisma;
    }
    // If Prisma schema changed while dev server is running, replace stale client.
    globalForPrisma.prisma = undefined;
  }

  const client = createClient();
  if (!hasConnectedAccountMetadataField(client)) {
    throw new Error(
      "Prisma client is stale and missing ConnectedAccount.metadataJson. Run `npm run prisma:generate` and restart dev server.",
    );
  }
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { getPrismaClient };
