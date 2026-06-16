// Temporary endpoint for verifying Sentry server-side error capture. The page at
// /sentry-example-page calls this; it deliberately throws so the error shows up
// in Sentry Issues. Safe to delete once Sentry is confirmed working.
export const dynamic = "force-dynamic";

class SentryExampleAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

export function GET() {
  throw new SentryExampleAPIError(
    "This error is raised on the backend called by the example page."
  );
}
