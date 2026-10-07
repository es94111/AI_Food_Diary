import type { RecordingStreak } from "@/lib/recording-streak";

export function RecordingStreakCard({ streak }: { streak: RecordingStreak }) {
  const message = streak.currentStreak > 0
    ? `目前已連續記錄 ${streak.currentStreak} 天，照自己的節奏繼續就好。`
    : streak.lastRecordedDate
      ? `最近一次記錄是 ${streak.lastRecordedDate}。想繼續時，從一筆餐點或飲水開始就好。`
      : "每一天都可以從一筆餐點或飲水紀錄開始。";

  return (
    <article className="recording-streak-card" aria-label="連續記錄摘要">
      <div className="recording-streak-intro">
        <p className="dashboard-eyebrow">YOUR RECORDING RHYTHM</p>
        <h2>連續記錄</h2>
        <p>{message}</p>
      </div>
      <div className="recording-streak-metrics">
        <div>
          <strong>{streak.currentStreak}</strong>
          <span>目前連續天數</span>
        </div>
        <div>
          <strong>{streak.longestStreak}</strong>
          <span>最長連續天數</span>
        </div>
        <div>
          <strong className="recording-streak-date">{streak.lastRecordedDate ?? "—"}</strong>
          <span>最近一次記錄</span>
        </div>
      </div>
    </article>
  );
}
