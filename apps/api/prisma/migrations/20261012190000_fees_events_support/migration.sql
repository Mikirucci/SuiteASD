-- AlterTable
ALTER TABLE "Event" ADD COLUMN "maxConvocations" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "lastReminderAt" DATETIME;

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReceiptSequence_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IdempotencyKey_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSequence_societyId_key" ON "ReceiptSequence"("societyId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_societyId_idx" ON "IdempotencyKey"("societyId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_societyId_key_key" ON "IdempotencyKey"("societyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_feePlanId_memberId_dueDate_key" ON "Payment"("feePlanId", "memberId", "dueDate");
