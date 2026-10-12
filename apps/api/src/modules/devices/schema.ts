import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { devicePlatformSchema } from '../../shared/enums.js';

export const registerDeviceBodySchema = z.object({
  platform: devicePlatformSchema,
  token: z.string().trim().min(8).max(4096).describe('Push token issued by the platform (FCM/APNs/Web Push)'),
});

export const deviceSchema = z.object({
  id: z.string(),
  platform: devicePlatformSchema,
  lastSeenAt: isoDateTimeSchema,
});

export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;
export type DeviceDto = z.infer<typeof deviceSchema>;
