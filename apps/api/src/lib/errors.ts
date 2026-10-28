/*
 * One error type for everything we EXPECT to go wrong (bad password, code expired...).
 * Throw it from anywhere; the error handler in app.ts turns it into:
 *   { "error": { "code": "...", "message": "..." } }
 * The web app reads `code` (to decide what to do) and `message` (to show the user).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (code: string, message: string) => new AppError(401, code, message);
export const forbidden = (code: string, message: string, details?: unknown) =>
  new AppError(403, code, message, details);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooMany = (code: string, message: string) => new AppError(429, code, message);
