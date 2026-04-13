import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Employee, ShiftType, Preferences, ScheduleResult } from '@/types/schedule';
import { generateSchedule } from '@/lib/scheduler';
import { fetchTaiwanCalendar, buildHolidayMap } from '@/lib/holidays';

const COVERAGE_KEYWORDS = ['夜班人力不足', '缺白班', '缺夜班', '所有人員均無法排班'];

/** 計算「有問題的天數」（同一天多個警告只算一天） */
function countProblematicDays(result: ScheduleResult): number {
  const days = new Set(
    result.warnings
      .filter(w => COVERAGE_KEYWORDS.some(kw => w.message.includes(kw)))
      .map(w => w.day)
  );
  return days.size;
}

interface ScheduleStore {
  // 設定（持久化）
  year: number;
  month: number;
  employees: Employee[];
  preferences: Preferences;
  maxRetries: number;

  // 產生結果
  result: ScheduleResult | null;
  isGenerating: boolean;

  // 步驟
  step: 1 | 2 | 3;

  // 假日資料（不持久化，啟動時重新抓取）
  holidayMap: Record<string, string>;
  holidayYear: number | null;
  holidaysLoading: boolean;

  // Actions
  setYearMonth: (year: number, month: number) => void;
  addEmployee: () => void;
  removeEmployee: (id: string) => void;
  updateEmployee: (id: string, updates: Partial<Omit<Employee, 'id'>>) => void;
  setPreference: (employeeId: string, day: number, shift: ShiftType | null) => void;
  clearPreferences: (employeeId: string) => void;
  setPreferences: (preferences: Preferences) => void;
  generate: () => Promise<void>;
  setStep: (step: 1 | 2 | 3) => void;
  setMaxRetries: (n: number) => void;
  fetchHolidays: (year: number) => Promise<void>;
}

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: '1', name: '護理師 A', daysOffTarget: 8 },
  { id: '2', name: '護理師 B', daysOffTarget: 8 },
  { id: '3', name: '護理師 C', daysOffTarget: 8 },
];

const now = new Date();

export const useScheduleStore = create<ScheduleStore>()(
  persist(
    (set, get) => ({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      employees: DEFAULT_EMPLOYEES,
      preferences: {},
      maxRetries: 50,
      result: null,
      isGenerating: false,
      step: 1,

      holidayMap: {},
      holidayYear: null,
      holidaysLoading: false,

      setYearMonth: (year, month) => set({ year, month }),

      addEmployee: () => {
        const { employees } = get();
        if (employees.length >= 5) return;
        const names = ['護理師 A', '護理師 B', '護理師 C', '護理師 D', '護理師 E'];
        const id = Date.now().toString();
        set({
          employees: [
            ...employees,
            { id, name: names[employees.length] ?? `護理師 ${employees.length + 1}`, daysOffTarget: 8 },
          ],
        });
      },

      removeEmployee: (id) => {
        const { employees, preferences } = get();
        if (employees.length <= 3) return;
        const newPrefs = { ...preferences };
        delete newPrefs[id];
        set({ employees: employees.filter(e => e.id !== id), preferences: newPrefs });
      },

      updateEmployee: (id, updates) => {
        set(state => ({
          employees: state.employees.map(e => (e.id === id ? { ...e, ...updates } : e)),
        }));
      },

      setPreference: (employeeId, day, shift) => {
        set(state => {
          const empPrefs = { ...(state.preferences[employeeId] ?? {}) };
          if (shift === null) {
            delete empPrefs[day];
          } else {
            empPrefs[day] = shift;
          }
          return { preferences: { ...state.preferences, [employeeId]: empPrefs } };
        });
      },

      clearPreferences: (employeeId) => {
        set(state => {
          const newPrefs = { ...state.preferences };
          delete newPrefs[employeeId];
          return { preferences: newPrefs };
        });
      },

      setPreferences: (preferences) => set({ preferences }),

      setMaxRetries: (n) => set({ maxRetries: Math.max(1, Math.min(100000, n)) }),

      generate: async () => {
        const { employees, year, month, preferences, maxRetries } = get();

        // 先顯示 loading，讓 UI 有機會重繪
        set({ isGenerating: true });
        await new Promise(resolve => setTimeout(resolve, 30));

        let best = generateSchedule(employees, year, month, preferences, 0);
        let bestDays = countProblematicDays(best);
        let totalTries = 1;

        for (let i = 1; i < maxRetries && bestDays > 0; i++) {
          const attempt = generateSchedule(employees, year, month, preferences, i);
          totalTries++;
          const days = countProblematicDays(attempt);
          if (days < bestDays) {
            best = attempt;
            bestDays = days;
          }
        }

        set({ result: { ...best, retryCount: totalTries }, step: 3, isGenerating: false });
      },

      setStep: (step) => set({ step }),

      fetchHolidays: async (year: number) => {
        const { holidayYear } = get();
        if (holidayYear === year) return;
        set({ holidaysLoading: true });
        try {
          const days = await fetchTaiwanCalendar(year);
          set({ holidayMap: buildHolidayMap(days), holidayYear: year, holidaysLoading: false });
        } catch (e) {
          console.error('無法載入台灣假日資料：', e);
          set({ holidaysLoading: false });
        }
      },
    }),
    {
      name: 'scheduler-settings',
      partialize: (state) => ({
        year: state.year,
        month: state.month,
        employees: state.employees,
        preferences: state.preferences,
        maxRetries: state.maxRetries,
      }),
    }
  )
);
