import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

mock.module("next/link", { exports: { default: () => null } });

let getAccountDeletionCleanupNoticeModel: typeof import("../../src/components/account-deletion-panel").getAccountDeletionCleanupNoticeModel;
before(async () => {
  ({ getAccountDeletionCleanupNoticeModel } = await import(
    "../../src/components/account-deletion-panel"
  ));
});

test("deletion panel model exposes a warning, retry, and manual cleanup guidance after failure", () => {
  const notice = getAccountDeletionCleanupNoticeModel(
    { localStorage: "failed", caches: "cleared" },
    "complete",
  );

  assert.ok(notice);
  assert.match(notice.heading, /帳號與伺服器資料已刪除/);
  assert.match(notice.heading, /本機草稿與應用狀態/);
  assert.match(notice.guidance, /重試自動清除/);
  assert.match(notice.guidance, /瀏覽器的此網站設定/);
});

test("unsupported browser storage produces no failure notice", () => {
  assert.equal(
    getAccountDeletionCleanupNoticeModel(
      { localStorage: "unavailable", caches: "unavailable" },
      "complete",
    ),
    null,
  );
});

test("uncertain server result is never presented as a confirmed deletion", () => {
  const notice = getAccountDeletionCleanupNoticeModel(
    { localStorage: "failed", caches: "unavailable" },
    "unknown",
  );

  assert.ok(notice);
  assert.match(notice.heading, /無法確認伺服器刪除結果/);
  assert.doesNotMatch(notice.heading, /帳號與伺服器資料已刪除/);
});
