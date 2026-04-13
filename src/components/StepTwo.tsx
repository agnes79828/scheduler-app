'use client';
import { useEffect, useRef } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { SHIFT_CONFIG, SHIFT_CYCLE } from '@/types/schedule';
import type { Preferences, ShiftType } from '@/types/schedule';
import { getDaysInMonth } from '@/lib/scheduler';
import { toDateKey } from '@/lib/holidays';

export default function StepTwo() {
  const {
    year, month, employees, preferences, isGenerating,
    setPreference, clearPreferences, setPreferences, generate, setStep,
    holidayMap, fetchHolidays,
  } = useScheduleStore();

  useEffect(() => {
    fetchHolidays(year);
  }, [year, fetchHolidays]);

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i);
  const importRef = useRef<HTMLInputElement>(null);

  const handleCellClick = (empId: string, day: number) => {
    const current = preferences[empId]?.[day] ?? null;
    const idx = SHIFT_CYCLE.indexOf(current);
    const next = SHIFT_CYCLE[(idx + 1) % SHIFT_CYCLE.length];
    setPreference(empId, day, next);
  };

  // 匯出：以員工姓名為 key，方便跨 session 匯入
  const handleExport = () => {
    const data = {
      version: 1,
      year,
      month,
      preferences: Object.fromEntries(
        employees.map(emp => [
          emp.name,
          preferences[emp.id] ?? {},
        ])
      ),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `排班偏好_${year}_${String(month).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 匯入：依員工姓名匹配，填回 preferences
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data?.preferences || typeof data.preferences !== 'object') {
          alert('檔案格式錯誤');
          return;
        }
        const newPrefs: Preferences = { ...preferences };
        const nameToId = Object.fromEntries(employees.map(e => [e.name, e.id]));
        let matched = 0;
        for (const [name, dayMap] of Object.entries(data.preferences)) {
          const id = nameToId[name];
          if (!id) continue;
          matched++;
          const empPrefs: Record<number, ShiftType> = {};
          for (const [dayStr, shift] of Object.entries(dayMap as Record<string, string>)) {
            const d = parseInt(dayStr);
            if (['day', 'night', 'full', 'off'].includes(shift)) {
              empPrefs[d] = shift as ShiftType;
            }
          }
          newPrefs[id] = empPrefs;
        }
        setPreferences(newPrefs);
        alert(`匯入完成（比對到 ${matched} 位員工）`);
      } catch {
        alert('檔案解析失敗，請確認格式正確');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-800">步驟 2：設定排班偏好（選填）</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ↓ 匯出設定
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
          >
            ↑ 匯入設定
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </div>
      <p className="text-sm text-gray-700 mb-1">
        點擊格子循環切換班別：
        <span className="mx-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-xs border border-sky-300">白班</span>→
        <span className="mx-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs border border-indigo-300">夜班</span>→
        <span className="mx-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-xs border border-rose-300">全日</span>→
        <span className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs border border-gray-300">休</span>→ 清除
      </p>
      <div className="flex items-center gap-3 mb-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-200" />週末
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-300" />國定假日
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse select-none">
          <thead>
            <tr>
              <th className="p-2 border border-gray-200 bg-gray-100 sticky left-0 z-10 min-w-24 text-left text-gray-700 font-semibold">
                員工
              </th>
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
              <th className="p-2 border border-gray-200 bg-gray-100 text-gray-600 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td className="p-2 border border-gray-200 sticky left-0 bg-white z-10 font-semibold text-gray-800 whitespace-nowrap">
                  {emp.name}
                </td>
                {days.map(d => {
                  const shift = preferences[emp.id]?.[d] ?? null;
                  const config = shift ? SHIFT_CONFIG[shift] : null;
                  const key = toDateKey(year, month, d);
                  const isHoliday = key in holidayMap;
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick(emp.id, d)}
                      className={`border border-gray-200 text-center cursor-pointer transition-opacity hover:opacity-70 w-8 h-8 ${
                        config
                          ? config.color
                          : isHoliday
                          ? 'bg-red-50 hover:bg-red-100'
                          : 'hover:bg-blue-50'
                      }`}
                    >
                      {config?.label ?? ''}
                    </td>
                  );
                })}
                <td className="px-3 border border-gray-200 text-center whitespace-nowrap">
                  <button
                    onClick={() => clearPreferences(emp.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    清除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
        >
          ← 上一步
        </button>
        <button
          onClick={() => generate()}
          disabled={isGenerating}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isGenerating && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {isGenerating ? '排班中…' : '產生排班 →'}
        </button>
      </div>
    </div>
  );
}
