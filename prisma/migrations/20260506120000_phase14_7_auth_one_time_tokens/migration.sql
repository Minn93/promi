-- CreateTable
CREATE TABLE "auth_one_time_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "auth_one_time_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_one_time_tokens_type_token_hash_key" ON "auth_one_time_tokens"("type", "token_hash");

-- CreateIndex
CREATE INDEX "auth_one_time_tokens_user_id_type_created_at_idx" ON "auth_one_time_tokens"("user_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "auth_one_time_tokens_expires_at_idx" ON "auth_one_time_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_one_time_tokens" ADD CONSTRAINT "auth_one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
