import { getNouriLedgerOrigin } from "@/lib/nouriledger-handoff";

// "Move my data to the new app" entry on the settings page. Renders nothing unless the operator configured
// NOURILEDGER_ORIGIN. A plain link: the work happens on NouriLedger after the user signs in there and confirms.
export function NouriLedgerMigrationCard() {
  const origin = getNouriLedgerOrigin();
  if (!origin) return null;
  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-xl font-black">搬到新版「養財日記 NouriLedger」</h2>
      <p className="mt-1 text-sm text-stone-500">
        一鍵把你在這裡的餐點、照片、常用食物、飲水與健康紀錄複製到 NouriLedger。需要在新站用 Google 登入並確認一次；
        這裡的資料不會被刪除，個人 AI 金鑰也不會被帶走。
      </p>
      <a
        href={`${origin}/migrate/start?source=food-diary`}
        className="mt-4 inline-block rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
      >
        一鍵匯入到 NouriLedger
      </a>
    </div>
  );
}
