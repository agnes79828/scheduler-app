import type {
  Employee,
  ShiftType,
  Preferences,
  GeneratedSchedule,
  ScheduleWarning,
  ScheduleResult,
  EmployeeStats,
} from '@/types/schedule';

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getWeekday(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

function isWorking(shift: ShiftType | null): boolean {
  return shift !== null && shift !== 'off';
}

function consecutiveWorkDaysBefore(schedule: (ShiftType | null)[], day: number): number {
  let count = 0;
  for (let d = day - 1; d >= 0; d--) {
    if (isWorking(schedule[d])) count++;
    else break;
  }
  return count;
}

function consecutiveRestDaysBefore(schedule: (ShiftType | null)[], day: number): number {
  let count = 0;
  for (let d = day - 1; d >= 0; d--) {
    if (schedule[d] === 'off') count++;
    else break;
  }
  return count;
}

function workedNightBefore(schedule: (ShiftType | null)[], day: number): boolean {
  if (day === 0) return false;
  const prev = schedule[day - 1];
  return prev === 'night' || prev === 'full';
}

function checkCoverage(shifts: (ShiftType | null)[]): { hasDay: boolean; hasNight: boolean } {
  const hasDay = shifts.some(s => s === 'day' || s === 'full');
  const hasNight = shifts.some(s => s === 'night' || s === 'full');
  return { hasDay, hasNight };
}

// Fisher-Yates 洗牌，使用 Math.random()，每次呼叫結果不同
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const COVERAGE_KEYWORDS = ['夜班人力不足', '缺白班', '缺夜班', '所有人員均無法排班'];

/** 有問題的覆蓋天數（同一天多個警告只算 1 天） */
export function countProblematicDays(result: ScheduleResult): number {
  return new Set(
    result.warnings
      .filter(w => COVERAGE_KEYWORDS.some(kw => w.message.includes(kw)))
      .map(w => w.day)
  ).size;
}

/** 偏好不滿足的班次數（被排到非偏好班別的次數） */
export function countPreferenceViolations(result: ScheduleResult, employees: Employee[]): number {
  let count = 0;
  for (const emp of employees) {
    if (emp.shiftPreference === 'none') continue;
    for (const shift of result.schedule[emp.id] ?? []) {
      if (shift === 'off') continue;
      if (emp.shiftPreference === 'day' && shift === 'night') count++;
      if (emp.shiftPreference === 'night' && shift === 'day') count++;
    }
  }
  return count;
}

export function generateSchedule(
  employees: Employee[],
  year: number,
  month: number,
  preferences: Preferences,
): ScheduleResult {
  const daysInMonth = getDaysInMonth(year, month);
  const warnings: ScheduleWarning[] = [];

  const schedule: Record<string, (ShiftType | null)[]> = {};
  const workCounts: Record<string, number> = {};
  const offCounts: Record<string, number> = {};

  for (const emp of employees) {
    schedule[emp.id] = Array(daysInMonth).fill(null);
    workCounts[emp.id] = 0;
    offCounts[emp.id] = 0;

    const prefs = preferences[emp.id] ?? {};
    for (const [dayStr, shift] of Object.entries(prefs)) {
      const day = parseInt(dayStr);
      if (day >= 0 && day < daysInMonth) {
        schedule[emp.id][day] = shift;
        if (shift === 'off') offCounts[emp.id]++;
        else workCounts[emp.id]++;
      }
    }
  }

  for (let day = 0; day < daysInMonth; day++) {
    const dayShifts = employees.map(e => schedule[e.id][day]);
    const { hasDay, hasNight } = checkCoverage(dayShifts);

    if (hasDay && hasNight) {
      for (const emp of employees) {
        if (schedule[emp.id][day] === null) {
          if (offCounts[emp.id] < emp.daysOffTarget) {
            schedule[emp.id][day] = 'off';
            offCounts[emp.id]++;
          } else {
            // 已達休假上限，必須上班（覆蓋已足，補白班）
            schedule[emp.id][day] = 'day';
            workCounts[emp.id]++;
          }
        }
      }
      continue;
    }

    // 先隨機洗牌（Math.random），再 stable sort
    const unassigned = shuffle(employees.filter(e => schedule[e.id][day] === null));

    unassigned.sort((a, b) => {
      // 0. 已達休假上限者必須上班，最高優先
      const mustA = offCounts[a.id] >= a.daysOffTarget ? 0 : 1;
      const mustB = offCounts[b.id] >= b.daysOffTarget ? 0 : 1;
      if (mustA !== mustB) return mustA - mustB;
      // 1. 連休天數少的優先上班（讓連休的人繼續休，休假自然集中）
      const restA = consecutiveRestDaysBefore(schedule[a.id], day);
      const restB = consecutiveRestDaysBefore(schedule[b.id], day);
      return restA - restB;
      // 相同條件：維持洗牌後的隨機順序（stable sort）
    });

    const eligible = unassigned.filter(
      e => consecutiveWorkDaysBefore(schedule[e.id], day) < 5
    );
    const pool = eligible.length > 0 ? eligible : unassigned;
    const isForced = eligible.length === 0 && unassigned.length > 0;

    // 可上白班：昨天沒上夜班或全日班
    const dayPool = pool.filter(e => !workedNightBefore(schedule[e.id], day));
    const nightForcedForDay = dayPool.length === 0 && pool.length > 0;

    // 依班別偏好分群
    const prefersDayInPool   = dayPool.filter(e => e.shiftPreference === 'day');
    const prefersNightInPool = pool.filter(e => e.shiftPreference === 'night');

    const pickDay = (exclude?: string) => {
      const pd = prefersDayInPool.filter(e => e.id !== exclude);
      if (pd.length > 0) return pd[0];
      const dp = dayPool.filter(e => e.id !== exclude);
      if (dp.length > 0) return dp[0];
      return pool.filter(e => e.id !== exclude)[0] ?? null;
    };

    const pickNight = (exclude?: string) => {
      const pn = prefersNightInPool.filter(e => e.id !== exclude);
      if (pn.length > 0) return pn[0];
      return pool.filter(e => e.id !== exclude)[0] ?? null;
    };

    const needDay = !hasDay;
    const needNight = !hasNight;

    if (needDay && needNight) {
      if (pool.length === 0) {
        warnings.push({ day, message: `第 ${day + 1} 天：所有人員均無法排班` });
      } else if (pool.length === 1) {
        const emp = pool[0];
        schedule[emp.id][day] = 'day';
        workCounts[emp.id]++;
        if (nightForcedForDay) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 昨日夜班後仍需排白班（人力不足）` });
        warnings.push({ day, message: `第 ${day + 1} 天：夜班人力不足，可在結果頁圈選全日班後重新排班` });
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 突破 5 連班限制` });
      } else {
        const dayEmp = pickDay()!;
        const nightEmp = pickNight(dayEmp.id)!;
        schedule[dayEmp.id][day] = 'day';
        schedule[nightEmp.id][day] = 'night';
        workCounts[dayEmp.id]++;
        workCounts[nightEmp.id]++;
        if (nightForcedForDay) warnings.push({ day, message: `第 ${day + 1} 天：${dayEmp.name} 昨日夜班後仍需排白班（人力不足）` });
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：人力不足，突破 5 連班限制` });
      }
    } else if (needDay) {
      const emp = pickDay();
      if (emp) {
        schedule[emp.id][day] = 'day';
        workCounts[emp.id]++;
        if (nightForcedForDay) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 昨日夜班後仍需排白班（人力不足）` });
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 突破 5 連班限制（補白班）` });
      } else {
        warnings.push({ day, message: `第 ${day + 1} 天：缺白班，無可用人員` });
      }
    } else if (needNight) {
      const emp = pickNight();
      if (emp) {
        schedule[emp.id][day] = 'night';
        workCounts[emp.id]++;
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 突破 5 連班限制（補夜班）` });
      } else {
        warnings.push({ day, message: `第 ${day + 1} 天：缺夜班，無可用人員` });
      }
    }

    for (const emp of employees) {
      if (schedule[emp.id][day] === null) {
        if (offCounts[emp.id] < emp.daysOffTarget) {
          schedule[emp.id][day] = 'off';
          offCounts[emp.id]++;
        } else {
          // 已達休假上限，補白班
          schedule[emp.id][day] = 'day';
          workCounts[emp.id]++;
        }
      }
    }
  }

  const stats: Record<string, EmployeeStats> = {};
  for (const emp of employees) {
    let day = 0, night = 0, full = 0, off = 0;
    let maxConsecutive = 0, currentConsecutive = 0;

    for (const shift of schedule[emp.id]) {
      if (shift === 'day')        { day++;  currentConsecutive++; }
      else if (shift === 'night') { night++; currentConsecutive++; }
      else if (shift === 'full')  { full++;  currentConsecutive++; }
      else {
        off++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        currentConsecutive = 0;
      }
    }
    maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    stats[emp.id] = { day, night, full, off, maxConsecutive };
  }

  return {
    schedule: schedule as GeneratedSchedule,
    warnings,
    stats,
    retryCount: 1,
  };
}
