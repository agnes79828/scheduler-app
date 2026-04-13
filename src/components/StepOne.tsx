'use client';
import { useEffect } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { getMonthHolidayStats } from '@/lib/holidays';

export default function StepOne() {
  const {
    year, month, employees, maxRetries,
    setYearMonth, addEmployee, removeEmployee, updateEmployee, setStep, setMaxRetries,
    holidayMap, holidaysLoading, fetchHolidays,
  } = useScheduleStore();

  // 年份變更時自動抓取假日資料
  useEffect(() => {
    fetchHolidays(year);
  }, [year, fetchHolidays]);

  const stats = getMonthHolidayStats(holidayMap, year, month);
  const hasHolidayData = Object.keys(holidayMap).length > 0;

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold mb-5 text-gray-800">步驟 1：基本設定</h2>

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
