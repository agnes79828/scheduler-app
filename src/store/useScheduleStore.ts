import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Employee, ShiftType, ShiftMode, Preferences, ScheduleResult } from '@/types/schedule';
import { generateSchedule, countProblematicDays, countPreferenceViolations, countOverConsecutive, countOffDeviation } from '@/lib/scheduler';
import { generateNurseSchedule } from '@/lib/nurseScheduler';
import { fetchTaiwanCalendar, buildHolidayMap } from '@/lib/holidays';

interface ScheduleStore {
  // 設定（持久化）
  mode: ShiftMode;
  year: number;
  month: number;
  employees: Employee[];
  preferences: Preferences;
  previousTail: Record<string, (ShiftType | null)[]>;
  maxRetries: number;
  minPerShift: number; // 護理師模式：每班最低人數

  // 產生結果
  result: ScheduleResult | null;
  isGenerating: boolean;
  currentTry: number;

  // 步驟
  step: 1 | 2 | 3;

  // 假日資料（不持久化）
  holidayMap: Record<string, string>;
  holidayYear: number | null;
  holidaysLoading: boolean;

  // Actions
  setMode: (mode: ShiftMode) => void;
  setYearMonth: (year: number, month: number) => void;
  addEmployee: () => void;
  removeEmployee: (id: string) => void;
  updateEmployee: (id: string, updates: Partial<Omit<Employee, 'id'>>) => void;
  setPreference: (employeeId: string, day: number, shift: ShiftType | null) => void;
  clearPreferences: (employeeId: string) => void;
  setPreferences: (preferences: Preferences) => void;
  setEmployees: (employees: Employee[]) => void;
  setPreviousTailShift: (empId: string, dayIndex: number, shift: ShiftType | null) => void;
  generate: () => Promise<void>;
  setStep: (step: 1 | 2 | 3) => void;
  setMaxRetries: (n: number) => void;
  setMinPerShift: (n: number) => void;
  fetchHolidays: (year: number) => Promise<void>;
}

const DEFAULT_THERAPIST_EMPLOYEES: Employee[] = [
  { id: '1', name: '治療師 A', daysOffTarget: 8, shiftPreference: 'none' },
  { id: '2', name: '治療師 B', daysOffTarget: 8, shiftPreference: 'none' },
  { id: '3', name: '治療師 C', daysOffTarget: 8, shiftPreference: 'none' },
];

const NURSE_NAMES = 'ABCDEFGHIJKLMNOPQRST'.split('').map(l => `護理師 ${l}`);

const now = new Date();

export const useScheduleStore = create<ScheduleStore>()(
  persist(
    (set, get) => ({
      mode: 'therapist',
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      employees: DEFAULT_THERAPIST_EMPLOYEES,
      preferences: {},
      previousTail: {},
      maxRetries: 50,
      minPerShift: 5,
      result: null,
      isGenerating: false,
      currentTry: 0,
      step: 1,

      holidayMap: {},
      holidayYear: null,
      holidaysLoading: false,

      setMode: (mode) => {
        const { employees } = get();
        if (mode === 'therapist') {
          // 切回治療師：截斷到最多 5 人，不足 3 人補預設
          const kept = employees.slice(0, 5);
          set({
            mode,
            employees: kept.length >= 3 ? kept : DEFAULT_THERAPIST_EMPLOYEES,
            preferences: {},
            previousTail: {},
            result: null,
            step: 1,
          });
        } else {
          // 切到護理師：保留現有員工
          set({ mode, result: null, step: 1 });
        }
      },

      setYearMonth: (year, month) => set({ year, month }),

      addEmployee: () => {
        const { employees, mode } = get();
        const maxEmp = mode === 'nurse' ? 20 : 5;
        if (employees.length >= maxEmp) return;
        const id = Date.now().toString();
        const name = mode === 'nurse'
          ? (NURSE_NAMES[employees.length] ?? `護理師 ${employees.length + 1}`)
          : (['治療師 A', '治療師 B', '治療師 C', '治療師 D', '治療師 E'][employees.length] ?? `治療師 ${employees.length + 1}`);
        set({
          employees: [...employees, { id, name, daysOffTarget: 8, shiftPreference: 'none' }],
        });
      },

      removeEmployee: (id) => {
        const { employees, preferences, mode } = get();
        const minEmp = mode === 'nurse' ? 1 : 3;
        if (employees.length <= minEmp) return;
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

      setEmployees: (employees) => set({ employees }),

      setPreviousTailShift: (empId, dayIndex, shift) => {
        set(state => {
          const tail = [...(state.previousTail[empId] ?? Array(7).fill(null))];
          tail[dayIndex] = shift;
          return { previousTail: { ...state.previousTail, [empId]: tail } };
        });
      },

      setMaxRetries: (n) => set({ maxRetries: Math.max(1, Math.min(100000, n)) }),

      setMinPerShift: (n) => set({ minPerShift: Math.max(1, Math.min(10, n)) }),

      generate: async () => {
        const { employees, year, month, preferences, maxRetries, previousTail, mode, minPerShift } = get();

        set({ isGenerating: true, currentTry: 0 });
        await new Promise(resolve => setTimeout(resolve, 30));

        const runSchedule = () =>
          mode === 'nurse'
            ? generateNurseSchedule(employees, year, month, preferences, previousTail, minPerShift)
            : generateSchedule(employees, year, month, preferences, previousTail);

        // 複合評分（優先順序）：覆蓋問題 > 超過5連班 > 休假偏差 > 偏好違反
        const score = (r: ScheduleResult) => ({
          days: countProblematicDays(r),
          over: countOverConsecutive(r),
          off:  countOffDeviation(r, employees),
          pref: countPreferenceViolations(r, employees),
        });
        const isBetter = (a: ReturnType<typeof score>, b: ReturnType<typeof score>) => {
          if (a.days !== b.days) return a.days < b.days;
          if (a.over !== b.over) return a.over < b.over;
          if (a.off  !== b.off)  return a.off  < b.off;
          return a.pref < b.pref;
        };

        let best = runSchedule();
        let bestScore = score(best);
        let totalTries = 1;
        let lastYield = Date.now();

        for (let i = 1; i < maxRetries; i++) {
          if (bestScore.days === 0 && bestScore.over === 0 && bestScore.off === 0 && bestScore.pref === 0) break;

          // 每 150ms 更新一次進度，讓 UI 能重繪
          const now = Date.now();
          if (now - lastYield > 150) {
            set({ currentTry: i });
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYield = Date.now();
          }

          const attempt = runSchedule();
          totalTries++;
          const s = score(attempt);
          if (isBetter(s, bestScore)) {
            best = attempt;
            bestScore = s;
          }
        }

        set({ result: { ...best, retryCount: totalTries }, step: 3, isGenerating: false, currentTry: 0 });
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
        mode: state.mode,
        year: state.year,
        month: state.month,
        employees: state.employees,
        preferences: state.preferences,
        previousTail: state.previousTail,
        maxRetries: state.maxRetries,
        minPerShift: state.minPerShift,
      }),
    }
  )
);
