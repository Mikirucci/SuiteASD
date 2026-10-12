import type { PrismaClient } from '@prisma/client';
import { toIso } from '../../lib/schemas.js';
import type { AuthContext } from '../../lib/tokens.js';
import { devicePlatformSchema } from '../../shared/enums.js';
import type { DeviceDto, RegisterDeviceBody } from './schema.js';

// A push token is unique across the whole platform: when a phone is handed to another user (or another society)
// the token is reassigned to the caller. That is why this service takes the unscoped client.
export async function registerDevice(
  prisma: PrismaClient,
  auth: AuthContext,
  body: RegisterDeviceBody,
): Promise<DeviceDto> {
  const now = new Date();
  const device = await prisma.deviceToken.upsert({
    where: { token: body.token },
    create: {
      societyId: auth.societyId,
      userId: auth.userId,
      platform: body.platform,
      token: body.token,
      lastSeenAt: now,
    },
    update: { societyId: auth.societyId, userId: auth.userId, platform: body.platform, lastSeenAt: now },
  });
  return { id: device.id, platform: devicePlatformSchema.parse(device.platform), lastSeenAt: toIso(device.lastSeenAt) };
}
