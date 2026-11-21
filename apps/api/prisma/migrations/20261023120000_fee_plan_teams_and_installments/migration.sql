-- CreateTable
CREATE TABLE "FeePlanTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "feePlanId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeePlanTeam_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePlanTeam_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "FeePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePlanTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Carry the single team of existing plans over to the new table before the column is dropped.
INSERT INTO "FeePlanTeam" ("id", "societyId", "feePlanId", "teamId", "updatedAt")
SELECT lower(hex(randomblob(12))), "societyId", "id", "teamId", CURRENT_TIMESTAMP FROM "FeePlan" WHERE "teamId" IS NOT NULL;

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
    "installments" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeePlan_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePlan_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FeePlan" ("amountCents", "createdAt", "currency", "id", "installments", "isActive", "kind", "name", "seasonId", "societyId", "updatedAt") SELECT "amountCents", "createdAt", "currency", "id", coalesce("installments", 1) AS "installments", "isActive", "kind", "name", "seasonId", "societyId", "updatedAt" FROM "FeePlan";
DROP TABLE "FeePlan";
ALTER TABLE "new_FeePlan" RENAME TO "FeePlan";
CREATE INDEX "FeePlan_societyId_idx" ON "FeePlan"("societyId");
CREATE INDEX "FeePlan_societyId_seasonId_idx" ON "FeePlan"("societyId", "seasonId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FeePlanTeam_societyId_idx" ON "FeePlanTeam"("societyId");

-- CreateIndex
CREATE INDEX "FeePlanTeam_teamId_idx" ON "FeePlanTeam"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlanTeam_feePlanId_teamId_key" ON "FeePlanTeam"("feePlanId", "teamId");
