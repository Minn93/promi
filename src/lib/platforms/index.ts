import { registerPublisher } from "@/src/lib/platforms/core/registry";
import { MockPlatformPublisher } from "@/src/lib/platforms/mock/publisher";
import { XPlatformPublisher } from "@/src/lib/platforms/x/publisher";

let initialized = false;

// TODO(4차-publish): Replace mock publishers for Instagram/Facebook with real API integrations.

export function ensurePlatformRegistry() {
  if (initialized) return;
  registerPublisher(new XPlatformPublisher());
  registerPublisher(new MockPlatformPublisher("instagram"));
  registerPublisher(new MockPlatformPublisher("facebook"));
  initialized = true;
}
