export type ShiftType = 'day' | 'night' | 'full' | 'off';

export const SHIFT_CONFIG: Record<ShiftType, { label: string; color: string; darkColor: string }> = {
  day:   { label: '白班', color: 'bg-sky-100 text-sky-800 border border-sky-300',      darkColor: 'bg-sky-500 text-white' },
  night: { label: '夜班', color: 'bg-indigo-100 text-indigo-800 border border-indigo-300', darkColor: 'bg-indigo-500 text-white' },
  full:  { label: '全日', color: 'bg-rose-100 text-rose-800 border border-rose-300',    darkColor: 'bg-rose-500 text-white' },
  off:   { label: '休',   color: 'bg-gray-100 text-gray-500 border border-gray-200',   darkColor: 'bg-gray-300 text-gray-600' },
};

export const SHIFT_CYCLE: (ShiftType | null)[] = [null, 'day', 'night', 'full', 'off'];

export type ShiftPreference = 'none' | 'day' | 'night';

export interface Employee {
  id: string;
  name: string;
  daysOffTarget: number;
  shiftPreference: ShiftPreference;
}

export type DayPreferences = Record<number, ShiftType>; // key = 0-indexed day

export type Preferences = Record<string, DayPreferences>; // key = employeeId

export type GeneratedSchedule = Record<string, ShiftType[]>; // key = employeeId, value = array[daysInMonth]

export interface ScheduleWarning {
  day: number; // 0-indexed
  message: string;
}

export interface EmployeeStats {
  day: number;
  night: number;
  full: number;
  off: number;
  maxConsecutive: number;
}

export interface ScheduleResult {
  schedule: GeneratedSchedule;
  warnings: ScheduleWarning[];
  stats: Record<string, EmployeeStats>;
  retryCount: number; // 實際嘗試次數
}
