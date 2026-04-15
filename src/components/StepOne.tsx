'use client';
import { useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { getMonthHolidayStats } from '@/lib/holidays';
import { getDaysInMonth } from '@/lib/scheduler';
import type { ShiftPreference, ShiftType, Preferences } from '@/types/schedule';
import { SHIFT_CONFIG } from '@/types/schedule';
import ShiftPopover, { cellClickToOpen } from './ShiftPopover';
import type { OpenCell } from './ShiftPopover';

export default function StepOne() {
  const {
    year, month, employees, maxRetries, preferences, previousTail,
    setYearMonth, addEmployee, removeEmployee, updateEmployee,
    setEmployees, setPreferences, setStep, setMaxRetries,
    setPreviousTailShift,
    holidayMap, holidaysLoading, fetchHolidays,
  } = useScheduleStore();

  const [showPrevTail, setShowPrevTail] = useState(false);
  const [openCell, setOpenCell] = useState<OpenCell>(null);

  useEffect(() => {
    fetchHolidays(year);
  }, [year, fetchHolidays]);

  // 計算上個月的年月 & 實際日期（末 7 天）
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth);
  // dayIndex 0 = 7天前，6 = 前一天
  const prevTailDates = Array.from({ length: 7 }, (_, i) => prevDaysInMonth - 6 + i);

  const stats = getMonthHolidayStats(holidayMap, year, month);
  const hasHolidayData = Object.keys(holidayMap).length > 0;
  const importRef = useRef<HTMLInputElement>(null);

  // 匯出：基本設定 ＋ 排班偏好 ＋ 上月末7天 合併為一個檔案
  const handleExport = () => {
    const data = {
      version: 2,
      year,
      month,
      maxRetries,
      employees: employees.map(e => ({
        name: e.name,
        daysOffTarget: e.daysOffTarget,
        shiftPreference: e.shiftPreference,
      })),
      // 偏好以員工姓名為 key，跨 session 仍可識別
      preferences: Object.fromEntries(
        employees.map(emp => [emp.name, preferences[emp.id] ?? {}])
      ),
      // 上月末7天以員工姓名為 key（陣列長度7，index 0=最早，6=前一天）
      previousTail: Object.fromEntries(
        employees.map(emp => [emp.name, previousTail[emp.id] ?? Array(7).fill(null)])
      ),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `排班設定_${year}_${String(month).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 匯入：還原基本設定與排班偏好
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data?.employees)) { alert('檔案格式錯誤'); return; }

        if (typeof data.year === 'number' && typeof data.month === 'number') {
          setYearMonth(data.year, data.month);
        }
        if (typeof data.maxRetries === 'number') {
          setMaxRetries(data.maxRetries);
        }

        // 員工（重新生成 id）
        const imported = (data.employees as Array<Record<string, unknown>>)
          .slice(0, 5)
          .map((emp, idx) => ({
            id: `imported-${Date.now()}-${idx}`,
            name: typeof emp.name === 'string' ? emp.name : `員工 ${idx + 1}`,
            daysOffTarget: typeof emp.daysOffTarget === 'number' ? emp.daysOffTarget : 8,
            shiftPreference: (['none', 'day', 'night'].includes(emp.shiftPreference as string)
              ? emp.shiftPreference : 'none') as ShiftPreference,
          }));

        if (imported.length < 3) { alert('員工人數至少需要 3 人'); return; }
        setEmployees(imported);

        // 依員工姓名還原偏好
        const nameToId = Object.fromEntries(imported.map(e => [e.name, e.id]));
        const newPrefs: Preferences = {};
        if (data.preferences && typeof data.preferences === 'object') {
          for (const [name, dayMap] of Object.entries(data.preferences)) {
            const id = nameToId[name];
            if (!id) continue;
            const empPrefs: Record<number, ShiftType> = {};
            for (const [dayStr, shift] of Object.entries(dayMap as Record<string, string>)) {
              if (['day', 'night', 'full', 'off'].includes(shift)) {
                empPrefs[parseInt(dayStr)] = shift as ShiftType;
              }
            }
            newPrefs[id] = empPrefs;
          }
        }
        setPreferences(newPrefs);

        // 依員工姓名還原上月末7天
        const newPrevTail: Record<string, (ShiftType | null)[]> = {};
        if (data.previousTail && typeof data.previousTail === 'object') {
          for (const [name, tail] of Object.entries(data.previousTail)) {
            const id = nameToId[name];
            if (!id || !Array.isArray(tail)) continue;
            newPrevTail[id] = (tail as unknown[]).slice(0, 7).map(s =>
              ['day', 'night', 'full', 'off'].includes(s as string) ? s as ShiftType : null
            );
          }
        }
        // 用 setPreviousTailShift 逐格寫入
        for (const [empId, tail] of Object.entries(newPrevTail)) {
          tail.forEach((shift, idx) => setPreviousTailShift(empId, idx, shift));
        }

        alert(`匯入完成（${imported.length} 位員工）`);
      } catch {
        alert('檔案解析失敗，請確認格式正確');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">步驟 1：基本設定</h2>
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

      {/* 年月 */}
      <div className="flex gap-4 mb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">年份</label>
          <input
            type="number"
            value={year}
            onChange={e => setYearMonth(parseInt(e.target.value) || year, month)}
            className="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
          <select
            value={month}
            onChange={e => setYearMonth(year, parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 w-20 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} 月</option>
            ))}
          </select>
        </div>
      </div>

      {/* 當月假日統計 */}
      <div className="mb-6 min-h-[2.5rem]">
        {holidaysLoading && (
          <p className="text-xs text-gray-500 px-1">載入假日資料中…</p>
        )}
        {!holidaysLoading && hasHolidayData && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
            <span className="text-blue-500">📅</span>
            <span className="text-gray-700">
              {year} 年 {month} 月共{' '}
              <strong className="text-blue-700">{stats.total} 天</strong> 假日
              （週末 {stats.total - stats.national} 天
              {stats.national > 0 && (
                <>＋國定假日 <strong className="text-orange-600">{stats.national} 天</strong></>
              )}）
            </span>
          </div>
        )}
        {!holidaysLoading && !hasHolidayData && (
          <p className="text-xs text-gray-500 px-1">假日資料載入失敗，排班仍可正常使用</p>
        )}
      </div>

      {/* 員工名單 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-800">員工名單（{employees.length} / 5）</h3>
          {employees.length < 5 && (
            <button
              onClick={addEmployee}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md px-2 py-1 transition-colors hover:bg-blue-50"
            >
              + 新增員工
            </button>
          )}
        </div>
        <div className="space-y-2">
          {employees.map(emp => (
            <div key={emp.id} className="flex flex-wrap items-center gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <input
                type="text"
                value={emp.name}
                onChange={e => updateEmployee(emp.id, { name: e.target.value })}
                className="flex-1 min-w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="員工姓名"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-medium text-gray-700">休假</span>
                <input
                  type="number"
                  value={emp.daysOffTarget}
                  onChange={e => updateEmployee(emp.id, { daysOffTarget: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-800 w-12 text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
                  min={0}
                  max={20}
                />
                <span className="text-xs font-medium text-gray-700">天</span>
              </div>
              {/* 班別偏好 */}
              <div className="flex items-center gap-1 shrink-0">
                {(['none', 'day', 'night'] as const).map(pref => (
                  <button
                    key={pref}
                    onClick={() => updateEmployee(emp.id, { shiftPreference: pref })}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      emp.shiftPreference === pref
                        ? pref === 'day'
                          ? 'bg-sky-500 text-white border-sky-500'
                          : pref === 'night'
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-gray-400 text-white border-gray-400'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {pref === 'none' ? '無偏好' : pref === 'day' ? '偏白班' : '偏夜班'}
                  </button>
                ))}
              </div>
              {employees.length > 3 && (
                <button
                  onClick={() => removeEmployee(emp.id)}
                  className="text-gray-500 hover:text-red-500 transition-colors text-xl leading-none"
                  title="刪除"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 排班嘗試次數 */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-gray-800 shrink-0">最大嘗試次數</label>
          <input
            type="number"
            value={maxRetries}
            onChange={e => setMaxRetries(parseInt(e.target.value) || 1)}
            className="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm text-gray-800 text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
            min={1}
            max={100000}
          />
          <span className="text-xs text-gray-500">次（1–100,000，次數越多越慢但排出較佳結果）</span>
        </div>
      </div>

      {/* 上月末 7 天班別設定 */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setShowPrevTail(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
        >
          <span className={`inline-block transition-transform ${showPrevTail ? 'rotate-90' : ''}`}>▶</span>
          上月末 7 天班別（跨月連班規則用）
        </button>
        {showPrevTail && (
          <div className="mt-3 overflow-x-auto">
            <p className="text-xs text-gray-500 mb-2">
              點擊格子選擇班別，用於讓排班規則（連班上限 / 夜班後不接白班）跨月連續計算。不列入本月排班。
            </p>
            <table className="text-xs border-collapse select-none">
              <thead>
                <tr>
                  <th className="p-2 border border-gray-200 bg-gray-100 sticky left-0 z-10 min-w-24 text-left text-gray-700 font-semibold">
                    員工
                  </th>
                  {prevTailDates.map((date, i) => (
                    <th
                      key={i}
                      className="p-1 border border-gray-200 w-10 text-center font-medium bg-gray-100 text-gray-600"
                    >
                      <span className="block text-[10px] text-gray-400">{prevMonth}/{date}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <td className="p-2 border border-gray-200 sticky left-0 bg-white z-10 font-semibold text-gray-800 whitespace-nowrap">
                      {emp.name}
                    </td>
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const shift = previousTail[emp.id]?.[dayIndex] ?? null;
                      const config = shift ? SHIFT_CONFIG[shift] : null;
                      const cellKey = `tail-${emp.id}-${dayIndex}`;
                      const isOpen = openCell?.key === cellKey;
                      return (
                        <td
                          key={dayIndex}
                          onClick={e => setOpenCell(cellClickToOpen(e, cellKey, openCell))}
                          className={`border border-gray-200 text-center cursor-pointer transition-colors w-10 h-8 ${
                            isOpen ? 'ring-2 ring-blue-400 ring-inset' : ''
                          } ${config ? config.color : 'hover:bg-blue-50 text-gray-300'}`}
                        >
                          {config?.label ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ShiftPopover
          open={openCell}
          onPick={shift => {
            if (!openCell) return;
            const parts = openCell.key.split('-'); // tail-{empId}-{dayIndex}
            setPreviousTailShift(parts[1], parseInt(parts[2]), shift);
            setOpenCell(null);
          }}
          onClose={() => setOpenCell(null)}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setStep(2)}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          下一步 →
        </button>
      </div>
    </div>
  );
}
