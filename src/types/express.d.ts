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
      validatedQuery?: any;
    }
  }
}
