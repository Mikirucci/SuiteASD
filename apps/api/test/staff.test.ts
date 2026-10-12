import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';

describeCrudModule(
  {
    title: 'staff',
    path: '/staff',
    readRoles: ['ADMIN', 'SEGRETERIA', 'STAFF'],
    writeRoles: ['ADMIN'],
    createPayload: ({ n }) => ({
      firstName: 'Marco',
      lastName: `Villa ${n}`,
      email: 'marco.villa@example.test',
      role: 'COACH',
      qualifications: 'Allenatore 2 grado',
    }),
    invalidPayload: { firstName: '', role: 'PRESIDENT', email: 'nope' },
    invalidFields: ['firstName', 'role', 'email'],
    patch: {
      payload: { role: 'MANAGER', qualifications: null },
      expected: { role: 'MANAGER', qualifications: null, firstName: 'Marco' },
    },
  },
  (get) => {
    describe('staff rules', () => {
      it('defaults the role to COACH and filters by role and name', async () => {
        const { ctx, actors } = get();
        const create = (payload: object) =>
          ctx.app.inject({ method: 'POST', url: `${API}/staff`, headers: actors.ADMIN.headers, payload });
        const coach = await create({ firstName: 'Zeno', lastName: 'Filtro' });
        expect(coach.json()).toMatchObject({ role: 'COACH', userId: null });
        await create({ firstName: 'Ada', lastName: 'Filtro', role: 'MANAGER' });
        const names = async (query: string) => {
          const response = await ctx.app.inject({ method: 'GET', url: `${API}/staff?${query}`, headers: actors.STAFF.headers });
          return response.json<{ data: { firstName: string }[] }>().data.map((staff) => staff.firstName);
        };
        expect(await names('q=Filtro')).toEqual(['Ada', 'Zeno']);
        expect(await names('q=Filtro&role=MANAGER')).toEqual(['Ada']);
      });

      it('links a login account of the society only once', async () => {
        const { ctx, actors, outsider } = get();
        const post = (headers: { authorization: string }, userId: string) =>
          ctx.app.inject({
            method: 'POST',
            url: `${API}/staff`,
            headers,
            payload: { firstName: 'Linked', lastName: 'Coach', userId },
          });
        const first = await post(actors.ADMIN.headers, actors.ALLENATORE.user.id);
        expect(first.statusCode).toBe(201);
        expect(first.json()).toMatchObject({ userId: actors.ALLENATORE.user.id });
        const again = await post(actors.ADMIN.headers, actors.ALLENATORE.user.id);
        expect(again.statusCode).toBe(409);
        expect(again.json()).toMatchObject({ code: 'staff_user_already_linked' });
        const foreign = await post(outsider.headers, actors.ALLENATORE.user.id);
        expect(foreign.statusCode).toBe(404);
      });
    });
  },
);
