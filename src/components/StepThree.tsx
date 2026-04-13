'use client';
import { useEffect } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { SHIFT_CONFIG, SHIFT_CYCLE } from '@/types/schedule';
import { getDaysInMonth, getWeekday } from '@/lib/scheduler';
import { toDateKey } from '@/lib/holidays';

export default function StepThree() {
  const {
    year, month, employees, result, preferences, isGenerating, previousTail,
    setStep, setPreference, generate,
    holidayMap, fetchHolidays,
  } = useScheduleStore();

  // 上月末 7 天實際日期
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth);
  const prevTailDates = Array.from({ length: 7 }, (_, i) => prevDaysInMonth - 6 + i);

  useEffect(() => {
    fetchHolidays(year);
  }, [year, fetchHolidays]);

  if (!result) return null;

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i);
  const { schedule, warnings, stats, retryCount } = result;

  // 手動標記的格子總數
  const pendingCount = employees.reduce((total, emp) => {
    return total + Object.keys(preferences[emp.id] ?? {}).length;
  }, 0);

  // 點擊循環：null → 白 → 夜 → 全 → 休 → null
  const handleCellClick = (empId: string, day: number) => {
    const current = preferences[empId]?.[day] ?? null;
    const idx = SHIFT_CYCLE.indexOf(current);
    const next = SHIFT_CYCLE[(idx + 1) % SHIFT_CYCLE.length];
    setPreference(empId, day, next);
  };

  return (
    <div className="space-y-5">
      {/* 排班表 */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {year} 年 {month} 月排班表
          </h2>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" />週末
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-300" />國定假日
            </span>
          </div>
        </div>

        {/* 操作提示 */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800 mb-4">
          <span className="text-base mt-0.5">👆</span>
          <div>
            點擊格子循環切換班別（白→夜→全→休→清除），<strong>手動標記的格子不受人數限制</strong>，完成後按「重新排班」套用。
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />藍框 = 手動標記
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="text-xs border-collapse select-none">
            <thead>
              <tr>
                <th className="p-2 border border-gray-200 bg-gray-100 sticky left-0 z-10 min-w-24 text-left text-gray-700 font-semibold">
                  員工
                </th>
                {prevTailDates.map((date, i) => {
                  const key = toDateKey(prevYear, prevMonth, date - 1);
                  const holidayName = holidayMap[key] ?? '';
                  const isNational = holidayName.trim() !== '';
                  const weekday = getWeekday(prevYear, prevMonth, date);
                  const isWeekend = weekday === 0 || weekday === 6;
                  const isHoliday = isNational || isWeekend;
                  return (
                    <th
                      key={`prev-${i}`}
                      title={holidayName || `${prevYear}/${prevMonth}/${date}`}
                      className={`p-1 border border-gray-200 w-8 text-center font-medium opacity-75 ${
                        isNational
                          ? 'bg-orange-100 text-orange-700'
                          : isWeekend
                          ? 'bg-red-50 text-red-500'
                          : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      <span className="block text-[9px] leading-none">{prevMonth}/{date}</span>
                      {isNational && <span className="block text-[7px] leading-none text-orange-500">●</span>}
                    </th>
                  );
                })}
                <th className="border-l-2 border-l-gray-400 border-gray-200 w-0 p-0" />
                {days.map(d => {
                  const key = toDateKey(year, month, d);
                  const isHoliday = key in holidayMap;
                  const holidayName = holidayMap[key] ?? '';
                  const isNational = isHoliday && holidayName.trim() !== '';
                  return (
                    <th
                      key={d}
                      title={holidayName || undefined}
                      className={`p-1 border border-gray-200 w-8 text-center font-medium ${
                        isNational
                          ? 'bg-orange-100 text-orange-700'
                          : isHoliday
                          ? 'bg-red-50 text-red-500'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {d + 1}
                      {isNational && <span className="block text-[7px] leading-none text-orange-500">●</span>}
                    </th>
                  );
                })}
                <th className="p-2 border border-gray-200 bg-gray-100 text-gray-600 font-medium whitespace-nowrap">
                  工 / 休
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const s = stats[emp.id];
                const totalWork = s.day + s.night + s.full;
                return (
                  <tr key={emp.id}>
                    <td className="p-2 border border-gray-200 sticky left-0 bg-white z-10 font-semibold text-gray-800 whitespace-nowrap">
                      {emp.name}
                    </td>
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const date = prevTailDates[dayIndex];
                      const key = toDateKey(prevYear, prevMonth, date - 1);
                      const holidayName = holidayMap[key] ?? '';
                      const isNational = holidayName.trim() !== '';
                      const weekday = getWeekday(prevYear, prevMonth, date);
                      const isWeekend = weekday === 0 || weekday === 6;
                      const shift = previousTail[emp.id]?.[dayIndex] ?? null;
                      const config = shift ? SHIFT_CONFIG[shift] : null;
                      return (
                        <td
                          key={`prev-${dayIndex}`}
                          className={`border border-gray-200 text-center w-8 h-8 opacity-60 ${
                            config
                              ? config.color
                              : isNational
                              ? 'bg-orange-100 text-gray-300'
                              : isWeekend
                              ? 'bg-red-50 text-gray-300'
                              : 'bg-gray-50 text-gray-300'
                          }`}
                        >
                          {config?.label ?? '—'}
                        </td>
                      );
                    })}
                    <td className="border-l-2 border-l-gray-400 border-gray-200 w-0 p-0" />
                    {days.map(d => {
                      const scheduledShift = schedule[emp.id]?.[d];
                      const prefShift = preferences[emp.id]?.[d] ?? null;
                      const hasPref = prefShift !== null;
                      // 有手動標記就顯示標記的班別，否則顯示排班結果
                      const displayShift = hasPref ? prefShift : scheduledShift;
                      const config = displayShift ? SHIFT_CONFIG[displayShift] : null;
                      const key = toDateKey(year, month, d);
                      const isHoliday = key in holidayMap;

                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(emp.id, d)}
                          title={hasPref ? `手動標記：${config?.label ?? '清除'} （點擊切換）` : '點擊標記班別'}
                          className={`border text-center w-8 h-8 cursor-pointer transition-all hover:opacity-75 ${
                            hasPref
                              ? `border-blue-400 ring-2 ring-inset ring-blue-400 ${config ? config.color : 'bg-white'}`
                              : config
                              ? `border-gray-200 ${config.color}`
                              : isHoliday
                              ? 'border-gray-200 bg-red-50'
                              : 'border-gray-200'
                          }`}
                        >
                          {config?.label ?? ''}
                        </td>
                      );
                    })}
                    <td className="px-2 border border-gray-200 text-center text-gray-700 font-medium whitespace-nowrap">
                      {totalWork} / {s.off}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 重新排班區 */}
        <div className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 border transition-colors ${
          pendingCount > 0
            ? 'bg-blue-50 border-blue-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <span className="text-sm text-gray-700 flex items-center gap-3">
            {pendingCount > 0
              ? <><strong className="text-blue-700">{pendingCount}</strong> 個格子已手動標記</>
              : '點擊格子標記後可重新排班'
            }
            <span className="text-xs text-gray-400">已嘗試 {retryCount} 次</span>
          </span>
          <button
            onClick={() => generate()}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              isGenerating
                ? 'bg-blue-400 text-white cursor-not-allowed'
                : pendingCount > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-default'
            }`}
            disabled={pendingCount === 0 || isGenerating}
          >
            {isGenerating && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {isGenerating ? '排班中…' : '重新排班'}
          </button>
        </div>
      </div>

      {/* 警告 */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-semibold text-amber-900 mb-2">排班警告（{warnings.length} 筆）</h3>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-800">
                • {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 統計 */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold text-gray-800 mb-4">員工統計</h3>
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 px-3 text-gray-700 font-semibold">員工</th>
                <th className="text-center py-2 px-3 text-sky-700 font-semibold">白班</th>
                <th className="text-center py-2 px-3 text-indigo-700 font-semibold">夜班</th>
                <th className="text-center py-2 px-3 text-rose-700 font-semibold">全日</th>
                <th className="text-center py-2 px-3 text-gray-600 font-semibold">休假</th>
                <th className="text-center py-2 px-3 text-gray-700 font-semibold">最長連班</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const s = stats[emp.id];
                return (
                  <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-3 font-semibold text-gray-800">{emp.name}</td>
                    <td className="py-2 px-3 text-center text-sky-700 font-medium">{s.day}</td>
                    <td className="py-2 px-3 text-center text-indigo-700 font-medium">{s.night}</td>
                    <td className="py-2 px-3 text-center text-rose-700 font-medium">{s.full}</td>
                    <td className="py-2 px-3 text-center text-gray-600 font-medium">{s.off}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`font-semibold ${s.maxConsecutive >= 5 ? 'text-red-600' : 'text-gray-800'}`}>
                        {s.maxConsecutive} 天
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="flex justify-between pb-6">
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
        >
          ← 調整偏好
        </button>
        <button
          onClick={() => setStep(1)}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          重新設定
        </button>
      </div>
    </div>
  );
}
