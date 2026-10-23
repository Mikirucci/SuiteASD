-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "occurredOn" DATETIME NOT NULL,
    "paymentId" TEXT,
    "sponsorId" TEXT,
    "venueId" TEXT,
    "kitId" TEXT,
    "tripId" TEXT,
    "refereeAssignmentId" TEXT,
    "supplier" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LedgerEntry_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_refereeAssignmentId_fkey" FOREIGN KEY ("refereeAssignmentId") REFERENCES "RefereeAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LedgerEntry" ("amountCents", "category", "createdAt", "createdById", "description", "id", "kind", "kitId", "occurredOn", "paymentId", "societyId", "sponsorId", "tripId", "updatedAt", "venueId") SELECT "amountCents", "category", "createdAt", "createdById", "description", "id", "kind", "kitId", "occurredOn", "paymentId", "societyId", "sponsorId", "tripId", "updatedAt", "venueId" FROM "LedgerEntry";
DROP TABLE "LedgerEntry";
ALTER TABLE "new_LedgerEntry" RENAME TO "LedgerEntry";
CREATE UNIQUE INDEX "LedgerEntry_venueId_key" ON "LedgerEntry"("venueId");
CREATE UNIQUE INDEX "LedgerEntry_kitId_key" ON "LedgerEntry"("kitId");
CREATE UNIQUE INDEX "LedgerEntry_tripId_key" ON "LedgerEntry"("tripId");
CREATE UNIQUE INDEX "LedgerEntry_refereeAssignmentId_key" ON "LedgerEntry"("refereeAssignmentId");
CREATE INDEX "LedgerEntry_societyId_idx" ON "LedgerEntry"("societyId");
CREATE INDEX "LedgerEntry_societyId_occurredOn_idx" ON "LedgerEntry"("societyId", "occurredOn");
CREATE INDEX "LedgerEntry_societyId_kind_category_idx" ON "LedgerEntry"("societyId", "kind", "category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- The fee of every referee designation weighs on the balance: book the ones that already exist, on the day of the match.
INSERT INTO "LedgerEntry" ("id", "societyId", "kind", "category", "description", "amountCents", "occurredOn", "refereeAssignmentId", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(12))),
  a."societyId",
  'EXPENSE',
  'Arbitri',
  r."firstName" || ' ' || r."lastName" || ' · ' || h."name" || ' - ' || w."name",
  a."feeCents",
  (COALESCE(e."startsAt", m."playedAt", a."createdAt") / 86400000) * 86400000,
  a."id",
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "RefereeAssignment" a
JOIN "Referee" r ON r."id" = a."refereeId"
JOIN "Match" m ON m."id" = a."matchId"
JOIN "GroupTeam" h ON h."id" = m."homeTeamId"
JOIN "GroupTeam" w ON w."id" = m."awayTeamId"
LEFT JOIN "Event" e ON e."id" = m."eventId"
WHERE a."feeCents" > 0;
