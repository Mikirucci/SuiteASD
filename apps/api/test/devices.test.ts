import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, type Actor } from './helpers/factories.js';

describe('POST /devices', () => {
  let ctx: TestContext;
  let societyId: string;
  let parent: Actor;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Devices ASD')).id;
    parent = await createActor(ctx, societyId, 'GENITORE');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const register = (actor: Actor | null, payload: object) =>
    ctx.app.inject({ method: 'POST', url: `${API}/devices`, headers: actor?.headers, payload });

  it('requires authentication', async () => {
    expect((await register(null, { platform: 'IOS', token: 'token-without-auth' })).statusCode).toBe(401);
  });

  it.each(ROLES)('is available to %s', async (role) => {
    const actor = await createActor(ctx, societyId, role);
    const response = await register(actor, { platform: 'ANDROID', token: `token-for-${role}-device` });
    expect(response.statusCode).toBe(201);
  });

  it('stores the token for the caller and society', async () => {
    const response = await register(parent, { platform: 'IOS', token: 'apns-token-parent-1' });
    expect(response.json()).toMatchObject({ platform: 'IOS' });
    const stored = await ctx.prisma.deviceToken.findUniqueOrThrow({ where: { token: 'apns-token-parent-1' } });
    expect(stored).toMatchObject({ userId: parent.user.id, societyId });
  });

  it('is idempotent: registering the same token again keeps one row', async () => {
    const first = await register(parent, { platform: 'WEB', token: 'web-push-token-1' });
    const second = await register(parent, { platform: 'WEB', token: 'web-push-token-1' });
    expect(second.json().id).toBe(first.json().id);
    expect(await ctx.prisma.deviceToken.count({ where: { token: 'web-push-token-1' } })).toBe(1);
  });

  it('reassigns a token to the new owner when the device changes hands', async () => {
    const other = await createActor(ctx, (await createSociety(ctx, 'Other ASD')).id, 'ATLETA');
    await register(parent, { platform: 'ANDROID', token: 'shared-phone-token' });
    await register(other, { platform: 'ANDROID', token: 'shared-phone-token' });
    const stored = await ctx.prisma.deviceToken.findUniqueOrThrow({ where: { token: 'shared-phone-token' } });
    expect(stored).toMatchObject({ userId: other.user.id, societyId: other.societyId });
  });

  it('validates platform and token', async () => {
    const response = await register(parent, { platform: 'WINDOWS_PHONE', token: 'x' });
    expect(response.statusCode).toBe(422);
    const paths = response.json().errors.map((error: { path: string }) => error.path);
    expect(paths).toEqual(expect.arrayContaining(['platform', 'token']));
  });
});
