// A normal user records a handful of drinks per day. Keep a generous ceiling
// so malformed or scripted clients cannot turn a single day into an unbounded
// database/response workload.
export const MAX_WATER_LOGS_PER_DAY = 500;
