-- CreateTable
CREATE TABLE "admin_login_attempts" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_login_attempts_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "admin_login_attempts_expires_at_idx" ON "admin_login_attempts"("expires_at");
