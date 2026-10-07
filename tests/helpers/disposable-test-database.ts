export function isDisposableTestDatabaseUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const connectionOverrides = new Set(["dbname", "host", "hostaddr", "service", "servicefile"]);
    const overridesConnectionTarget = [...parsed.searchParams.keys()]
      .some((key) => connectionOverrides.has(key.toLowerCase()));
    return ["postgres:", "postgresql:"].includes(parsed.protocol)
      && ["127.0.0.1", "localhost"].includes(parsed.hostname)
      && !overridesConnectionTarget
      && databaseName.endsWith("_test");
  } catch {
    return false;
  }
}
