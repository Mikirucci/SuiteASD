-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societyId" TEXT NOT NULL,
    "email" TEXT,
    "label" TEXT,
    "role" TEXT NOT NULL,
    "memberId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invitation_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invitation" ("acceptedAt", "createdAt", "email", "expiresAt", "id", "invitedById", "memberId", "revokedAt", "role", "societyId", "tokenHash", "updatedAt") SELECT "acceptedAt", "createdAt", "email", "expiresAt", "id", "invitedById", "memberId", "revokedAt", "role", "societyId", "tokenHash", "updatedAt" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_societyId_email_idx" ON "Invitation"("societyId", "email");
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Collaborators who already joined through an invitation get their card in Staff (new joiners get it on acceptance)
INSERT INTO "StaffMember" ("id", "societyId", "userId", "firstName", "lastName", "email", "role", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), i."societyId", u."id", u."firstName", u."lastName", u."email",
  CASE i."role" WHEN 'ALLENATORE' THEN 'COACH' WHEN 'STAFF' THEN 'OTHER' ELSE 'MANAGER' END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Invitation" i
JOIN "User" u ON u."email" = i."email"
WHERE i."acceptedAt" IS NOT NULL
  AND i."role" IN ('ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF')
  AND NOT EXISTS (SELECT 1 FROM "StaffMember" s WHERE s."societyId" = i."societyId" AND s."userId" = u."id")
GROUP BY i."societyId", u."id";
