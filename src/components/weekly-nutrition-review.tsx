type DayReview = {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  imageCount: number;
};

export function WeeklyNutritionReview({ days }: { days: DayReview[] }) {
  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <h2 className="text-2xl font-black">星期營養回顧</h2>
      <div className="mt-4 grid gap-3">
        {days.map((day) => (
          <article className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.65)" }} key={day.date}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{day.date}</p>
              <p className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">{day.calories} kcal</p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Metric label="蛋白質" value={`${day.protein.toFixed(1)}g`} />
              <Metric label="脂肪" value={`${day.fat.toFixed(1)}g`} />
              <Metric label="碳水" value={`${day.carbs.toFixed(1)}g`} />
              <Metric label="照片" value={`${day.imageCount}`} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-stone-50 p-2"><p className="font-bold text-stone-900">{value}</p><p className="text-stone-500">{label}</p></div>;
}
