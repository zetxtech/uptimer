import { createMiddleware } from 'hono/factory';

import type { Env } from '../env';
import { AppError } from './errors';

function readBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function hasValidAdminTokenRequest(input: {
  env: Pick<Env, 'ADMIN_TOKEN'>;
  req: { header(name: string): string | undefined };
}): boolean {
  const token = input.env.ADMIN_TOKEN;
  if (!token) return false;
  return readBearerToken(input.req.header('authorization')) === token;
}

export const requireAdmin = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token) {
    throw new AppError(500, 'INTERNAL', 'Admin token not configured');
  }

  if (!hasValidAdminTokenRequest(c)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  await next();
});
