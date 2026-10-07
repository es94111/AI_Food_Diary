import assert from "node:assert/strict";
import { test } from "node:test";
import { isDisposableTestDatabaseUrl } from "../helpers/disposable-test-database";

test("the disposable database guard accepts only local PostgreSQL *_test databases", () => {
  assert.equal(isDisposableTestDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/food_diary_test"), true);
  assert.equal(isDisposableTestDatabaseUrl("postgres://user:pass@localhost:5432/api_test"), true);
  assert.equal(isDisposableTestDatabaseUrl("postgres://user:pass@localhost:5432/food_diary_test?dbname=food_diary"), false);
  assert.equal(isDisposableTestDatabaseUrl("postgres://user:pass@localhost:5432/food_diary_test?host=db.example.com"), false);
  assert.equal(isDisposableTestDatabaseUrl(undefined), false);
  assert.equal(isDisposableTestDatabaseUrl("not a URL"), false);
  assert.equal(isDisposableTestDatabaseUrl("mysql://user:pass@localhost:3306/food_diary_test"), false);
  assert.equal(isDisposableTestDatabaseUrl("postgresql://user:pass@localhost:5432/food_diary"), false);
  assert.equal(isDisposableTestDatabaseUrl("postgresql://user:pass@db.example.com:5432/food_diary_test"), false);
  assert.equal(isDisposableTestDatabaseUrl("postgresql://user:pass@localhost.example.com:5432/food_diary_test"), false);
});
