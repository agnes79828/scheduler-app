export interface TaiwanDay {
  date: string;        // "20260101"
  week: string;        // "四"
  isHoliday: boolean;
  description: string; // 國定假日名稱，週末通常為空字串
}

/** 記憶體快取，避免重複請求 */
const cache: Record<number, TaiwanDay[]> = {};

export async function fetchTaiwanCalendar(year: number): Promise<TaiwanDay[]> {
  if (cache[year]) return cache[year];
  const res = await fetch(
    `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`
  );
  if (!res.ok) throw new Error(`無法取得 ${year} 年假日資料`);
  const data: TaiwanDay[] = await res.json();
  cache[year] = data;
  return data;
}

/**
 * 建立假日 Map：YYYYMMDD → 假日名稱
 * - key 存在 = 該天是假日（含週末、補假、國定假日）
 * - value 非空 = 有具體假日名稱（國定假日 / 補假）
 */
export function buildHolidayMap(days: TaiwanDay[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of days) {
    if (d.isHoliday) {
      map[d.date] = d.description;
    }
  }
  return map;
}

export interface MonthHolidayStats {
  total: number;    // 該月總放假天數（週末 + 國定假日）
  national: number; // 其中有名稱的假日（國定假日 / 補假）
}

export function getMonthHolidayStats(
  holidayMap: Record<string, string>,
  year: number,
  month: number
): MonthHolidayStats {
  const prefix = `${year}${String(month).padStart(2, '0')}`;
  const keys = Object.keys(holidayMap).filter(k => k.startsWith(prefix));
  const national = keys.filter(k => (holidayMap[k] ?? '').trim() !== '').length;
  return { total: keys.length, national };
}

/** 從 year/month/day(0-indexed) 產生 YYYYMMDD key */
export function toDateKey(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day + 1).padStart(2, '0')}`;
}
