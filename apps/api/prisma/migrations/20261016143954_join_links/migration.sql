-- CreateTable
CREATE TABLE "JoinLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "teamId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JoinLink_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JoinLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JoinLink_code_key" ON "JoinLink"("code");

-- CreateIndex
CREATE INDEX "JoinLink_societyId_idx" ON "JoinLink"("societyId");
