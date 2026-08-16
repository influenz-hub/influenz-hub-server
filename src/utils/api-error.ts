/**
 * Errors thrown by services carry an HTTP status and a stable machine-readable
 * code, so the error handler can translate them without services knowing about
 * Express, and clients can branch on `code` rather than parsing messages.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message = "Bad request", details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You don't have access to this resource") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message = "Conflict", details?: unknown) {
    return new ApiError(409, "CONFLICT", message, details);
  }

  static tooManyRequests(message = "Too many requests") {
    return new ApiError(429, "TOO_MANY_REQUESTS", message);
  }

  static internal(message = "Something went wrong") {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}
