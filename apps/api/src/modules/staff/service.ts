import type { StaffMember } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { conflict, notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { staffRoleSchema } from '../../shared/enums.js';
import type { CreateStaffBody, ListStaffQuery, StaffDto, UpdateStaffBody } from './schema.js';

function toDto(staff: StaffMember): StaffDto {
  return {
    id: staff.id,
    firstName: staff.firstName,
    lastName: staff.lastName,
    email: staff.email,
    phone: staff.phone,
    role: staffRoleSchema.parse(staff.role),
    qualifications: staff.qualifications,
    notes: staff.notes,
    userId: staff.userId,
    createdAt: toIso(staff.createdAt),
    updatedAt: toIso(staff.updatedAt),
  };
}

// The scoped client only sees users that hold a membership in the society, so a foreign account looks "not found".
async function assertUserInSociety({ db }: TenantRequestContext, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  if (!(await db.user.findFirst({ where: { id: userId }, select: { id: true } }))) throw notFound('User');
}

const userTaken = () => conflict('staff_user_already_linked', 'This account is already linked to another staff member');

export const staffService: CrudService<StaffDto, CreateStaffBody, UpdateStaffBody, ListStaffQuery> = {
  async list({ db }, query) {
    const rows = await db.staffMember.findMany({
      where: {
        ...(query.role ? { role: query.role } : {}),
        ...(query.q ? { OR: [{ firstName: { contains: query.q } }, { lastName: { contains: query.q } }] } : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toDto), page: page.page };
  },

  async get({ db }, id) {
    const staff = await db.staffMember.findFirst({ where: { id } });
    if (!staff) throw notFound('Staff member');
    return toDto(staff);
  },

  async create(ctx, body) {
    await assertUserInSociety(ctx, body.userId);
    try {
      return toDto(await ctx.db.staffMember.create({ data: { ...body, societyId: ctx.auth.societyId } }));
    } catch (error) {
      if (isUniqueViolation(error)) throw userTaken();
      throw error;
    }
  },

  async update(ctx, id, body) {
    await assertUserInSociety(ctx, body.userId);
    try {
      return toDto(await ctx.db.staffMember.update({ where: { id }, data: body }));
    } catch (error) {
      if (isUniqueViolation(error)) throw userTaken();
      throw error;
    }
  },

  async remove({ db }, id) {
    const result = await db.staffMember.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Staff member');
  },
};
