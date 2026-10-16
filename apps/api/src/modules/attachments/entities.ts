import type { TenantDb } from '../../lib/tenant.js';
import { can, type Permission } from '../../rbac/permissions.js';
import type { AttachmentEntityType, Role } from '../../shared/enums.js';

// Who may see and change the attachments of each kind of record: the roles that manage the record itself.
// (Contracts, invoices and the like are not for coaches, athletes or guardians.)
const MANAGE: Record<AttachmentEntityType, Permission> = {
  VENUE: 'venues:write',
  SPONSOR: 'sponsors:write',
  TRIP: 'trips:write',
  KIT: 'kits:write',
  STAFF_MEMBER: 'staff:write',
  REFEREE: 'referees:write',
  LEDGER_ENTRY: 'ledger:write',
};

export function canManageAttachments(roles: readonly Role[], entityType: AttachmentEntityType): boolean {
  return can(roles, MANAGE[entityType]);
}

// The tenant client only sees the society's own rows: a record of another society looks like a missing one.
export async function entityExists(db: TenantDb, entityType: AttachmentEntityType, entityId: string): Promise<boolean> {
  const where = { id: entityId };
  switch (entityType) {
    case 'VENUE':
      return (await db.venue.count({ where })) > 0;
    case 'SPONSOR':
      return (await db.sponsor.count({ where })) > 0;
    case 'TRIP':
      return (await db.trip.count({ where })) > 0;
    case 'KIT':
      return (await db.kit.count({ where })) > 0;
    case 'STAFF_MEMBER':
      return (await db.staffMember.count({ where })) > 0;
    case 'REFEREE':
      return (await db.referee.count({ where })) > 0;
    case 'LEDGER_ENTRY':
      return (await db.ledgerEntry.count({ where })) > 0;
  }
}
