'use client';
import { useEffect, useState } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { SHIFT_CONFIG } from '@/types/schedule';
import { getDaysInMonth } from '@/lib/scheduler';
import { toDateKey } from '@/lib/holidays';
import ShiftPopover, { cellClickToOpen } from './ShiftPopover';
import type { OpenCell } from './ShiftPopover';

export default function StepTwo() {
  const {
    year, month, employees, preferences, isGenerating,
    setPreference, clearPreferences, generate, setStep,
    holidayMap, fetchHolidays,
  } = useScheduleStore();

  const [openCell, setOpenCell] = useState<OpenCell>(null);

  useEffect(() => {
    fetchHolidays(year);
  }, [year, fetchHolidays]);

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i);

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold mb-2 text-gray-800">步驟 2：設定排班偏好（選填）</h2>
      <p className="text-sm text-gray-700 mb-1">
        點擊格子選擇班別：
        <span className="mx-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-xs border border-sky-300">白班</span>
        <span className="mx-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs border border-indigo-300">夜班</span>
        <span className="mx-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-xs border border-rose-300">全日</span>
        <span className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs border border-gray-300">休</span>
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
                  const cellKey = `${emp.id}-${d}`;
                  const isOpen = openCell?.key === cellKey;
                  return (
                    <td
                      key={d}
                      onClick={e => setOpenCell(cellClickToOpen(e, cellKey, openCell))}
                      className={`border border-gray-200 text-center cursor-pointer transition-colors w-8 h-8 ${
                        isOpen ? 'ring-2 ring-blue-400 ring-inset z-20' : ''
                      } ${
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

      <ShiftPopover
        open={openCell}
        onPick={shift => {
          if (!openCell) return;
          const [empId, dayStr] = openCell.key.split('-');
          setPreference(empId, parseInt(dayStr), shift);
          setOpenCell(null);
        }}
        onClose={() => setOpenCell(null)}
      />

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
