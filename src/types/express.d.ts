import type { Role } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth / optionalAuth. */
      user?: { id: string; role: Role };
      /** Parsed query/params from the validate() middleware. */
      valid?: { query?: unknown; params?: unknown };
    }
  }
}

export {};
