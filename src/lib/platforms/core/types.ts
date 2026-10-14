export type Platform = "x" | "instagram" | "facebook";

export type PublishInput = {
  platform: Platform;
  accountId: string;
  text: string;
  mediaUrl?: string | null;
  /** Owner of the scheduled post; uploaded media must belong to this owner. */
  ownerId?: string | null;
  idempotencyKey?: string | null;
  accessToken?: string | null;
  externalAccountId?: string | null;
  isMockAccount?: boolean;
};

export type ValidationResult = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export type PublishResult = {
  providerPostId: string;
  providerUrl?: string;
  message: string;
  rawResponse?: unknown;
};

export interface PlatformPublisher {
  readonly platform: Platform;
  validate(input: PublishInput): Promise<ValidationResult> | ValidationResult;
  publish(input: PublishInput): Promise<PublishResult>;
}
