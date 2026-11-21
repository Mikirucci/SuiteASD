-- CreateTable
CREATE TABLE "FeePlanInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "feePlanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeePlanInstallment_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePlanInstallment_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "FeePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- A plan keeps the due dates its fees were created with (numbered in date order).
INSERT INTO "FeePlanInstallment" ("id", "societyId", "feePlanId", "number", "dueDate", "updatedAt")
SELECT lower(hex(randomblob(12))), "societyId", "feePlanId", ROW_NUMBER() OVER (PARTITION BY "feePlanId" ORDER BY "dueDate"), "dueDate", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "societyId", "feePlanId", "dueDate" FROM "Payment" WHERE "feePlanId" IS NOT NULL);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FeePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "seasonId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MONTHLY',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeePlan_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePlan_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FeePlan" ("amountCents", "createdAt", "currency", "id", "isActive", "kind", "name", "seasonId", "societyId", "updatedAt") SELECT "amountCents", "createdAt", "currency", "id", "isActive", "kind", "name", "seasonId", "societyId", "updatedAt" FROM "FeePlan";
DROP TABLE "FeePlan";
ALTER TABLE "new_FeePlan" RENAME TO "FeePlan";
CREATE INDEX "FeePlan_societyId_idx" ON "FeePlan"("societyId");
CREATE INDEX "FeePlan_societyId_seasonId_idx" ON "FeePlan"("societyId", "seasonId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FeePlanInstallment_societyId_idx" ON "FeePlanInstallment"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlanInstallment_feePlanId_number_key" ON "FeePlanInstallment"("feePlanId", "number");
