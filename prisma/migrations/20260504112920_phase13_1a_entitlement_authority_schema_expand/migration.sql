-- CreateTable
CREATE TABLE "owner_entitlements" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "plan_tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'env',
    "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "updated_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "owner_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_audit_logs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_plan_tier" TEXT,
    "next_plan_tier" TEXT,
    "previous_status" TEXT,
    "next_status" TEXT,
    "source" TEXT NOT NULL,
    "actor_owner_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_customers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "cancel_at" TIMESTAMPTZ(6),
    "trial_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_entitlements_owner_id_key" ON "owner_entitlements"("owner_id");

-- CreateIndex
CREATE INDEX "entitlement_audit_logs_owner_created_at_idx" ON "entitlement_audit_logs"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_owner_id_key" ON "billing_customers"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_id_key" ON "billing_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_owner_status_idx" ON "billing_subscriptions"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_provider_event_id_key" ON "billing_webhook_events"("provider", "provider_event_id");
