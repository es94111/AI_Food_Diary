import assert from "node:assert/strict";
import { test } from "node:test";
import { isDisposableTestDatabaseUrl } from "../helpers/disposable-test-database";

const localTestDatabase = "postgresql://user:password@127.0.0.1:5432/food_diary_test";

test("accepts only local PostgreSQL URLs naming a disposable test database", () => {
  assert.equal(isDisposableTestDatabaseUrl(localTestDatabase), true);
  assert.equal(
    isDisposableTestDatabaseUrl("postgres://user:password@localhost:5432/api_test"),
    true,
  );
  assert.equal(isDisposableTestDatabaseUrl(undefined), false);
  assert.equal(isDisposableTestDatabaseUrl("not a URL"), false);
  assert.equal(
    isDisposableTestDatabaseUrl("mysql://user:password@localhost:5432/food_diary_test"),
    false,
  );
  assert.equal(
    isDisposableTestDatabaseUrl("postgresql://user:password@db.example.test:5432/food_diary_test"),
    false,
  );
  assert.equal(
    isDisposableTestDatabaseUrl("postgresql://user:password@localhost:5432/food_diary"),
    false,
  );
});

test("rejects PostgreSQL connection-target query overrides", () => {
  for (const override of [
    "host=db.example.test",
    "hostaddr=203.0.113.15",
    "dbname=production",
    "service=production",
    "servicefile=%2Fetc%2Fpg_service.conf",
    "HOST=db.example.test",
  ]) {
    assert.equal(
      isDisposableTestDatabaseUrl(`${localTestDatabase}?${override}`),
      false,
      `${override} must not override the local test target`,
    );
  }
});
