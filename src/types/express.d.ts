import type { ProjectInstance } from '@/lib/project-manager';
import type { UserConfig, AccessLevel } from '@/lib/multi-config';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: UserConfig;
      project?: ProjectInstance;
      accessLevel?: AccessLevel;
      requestId?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod-validated query, type varies per-route
      validatedQuery?: any;
    }
  }
}
