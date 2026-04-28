import type { Platform } from "@prisma/client";
import type { PlatformAuthProvider } from "@/src/lib/platform-auth/core/types";
import { FacebookAuthProvider } from "@/src/lib/platform-auth/facebook";
import { InstagramAuthProvider } from "@/src/lib/platform-auth/instagram";
import { XAuthProvider } from "@/src/lib/platform-auth/x";

const providers = new Map<Platform, PlatformAuthProvider>();

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  const list: PlatformAuthProvider[] = [new XAuthProvider(), new InstagramAuthProvider(), new FacebookAuthProvider()];
  for (const provider of list) {
    providers.set(provider.platform, provider);
  }
  initialized = true;
}

export function getPlatformAuthProvider(platform: Platform): PlatformAuthProvider {
  ensureInitialized();
  const provider = providers.get(platform);
  if (!provider) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return provider;
}
