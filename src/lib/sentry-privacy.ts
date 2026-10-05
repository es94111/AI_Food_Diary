import type { DataCollection } from "@sentry/core";

// Sentry v11 replaced `sendDefaultPii` with `dataCollection` and flipped the
// defaults to "collect everything": user info, cookies, HTTP bodies, DB
// payloads, GenAI inputs/outputs, etc. This app stores meal photos and AI
// replies encrypted at rest, so shipping the v11 defaults would quietly start
// sending that content to Sentry. Pin the v10 (restrictive) baseline instead:
// only structural/latency/error data leaves the server, never user content.
//
// Sentry's own redaction is best effort and keyed on field names, so it is not
// a substitute for keeping these categories off in the first place.
export const sentryDataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  },
  httpBodies: [],
  // Signed image URLs carry their short-lived HMAC capability in query params;
  // disable automatic query collection entirely so traces cannot retain it.
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  graphQL: { document: false, variables: false },
  queues: false,
  stackFrameVariables: false,
};
