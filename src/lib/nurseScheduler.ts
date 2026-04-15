import type {
  Employee,
  ShiftType,
  Preferences,
  GeneratedSchedule,
  ScheduleWarning,
  ScheduleResult,
  EmployeeStats,
} from '@/types/schedule';
import { getDaysInMonth } from './scheduler';

// ── 通用工具 ────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isWorking(shift: ShiftType | null): boolean {
  return shift !== null && shift !== 'off';
}

function consecutiveWorkDaysBefore(
  schedule: (ShiftType | null)[],
  day: number,
  prevTail: (ShiftType | null)[] = [],
): number {
  let count = 0;
  for (let d = day - 1; d >= 0; d--) {
    if (isWorking(schedule[d])) count++;
    else return count;
  }
  for (let t = prevTail.length - 1; t >= 0; t--) {
    if (isWorking(prevTail[t])) count++;
    else return count;
  }
  return count;
}

function consecutiveRestDaysBefore(
  schedule: (ShiftType | null)[],
  day: number,
  prevTail: (ShiftType | null)[] = [],
): number {
  let count = 0;
  for (let d = day - 1; d >= 0; d--) {
    if (schedule[d] === 'off') count++;
    else return count;
  }
  for (let t = prevTail.length - 1; t >= 0; t--) {
    if (prevTail[t] === 'off') count++;
    else return count;
  }
  return count;
}

function prevShift(
  schedule: (ShiftType | null)[],
  day: number,
  prevTail: (ShiftType | null)[] = [],
): ShiftType | null {
  if (day > 0) return schedule[day - 1];
  if (prevTail.length > 0) return prevTail[prevTail.length - 1];
  return null;
}

/** 前一天是大夜班 → 今天必須全休 */
function mustRestAfterOvernight(
  schedule: (ShiftType | null)[],
  day: number,
  prevTail: (ShiftType | null)[] = [],
): boolean {
  return prevShift(schedule, day, prevTail) === 'overnight';
}

/** 前一天是夜班 → 今天不能排白班 */
function workedNightBefore(
  schedule: (ShiftType | null)[],
  day: number,
  prevTail: (ShiftType | null)[] = [],
): boolean {
  return prevShift(schedule, day, prevTail) === 'night';
}

// ── 護理師排班主函式 ─────────────────────────────────────────
export function generateNurseSchedule(
  employees: Employee[],
  year: number,
  month: number,
  preferences: Preferences,
  previousTail: Record<string, (ShiftType | null)[]> = {},
  minPerShift: number = 2,
): ScheduleResult {
  const daysInMonth = getDaysInMonth(year, month);
  const warnings: ScheduleWarning[] = [];

  // 本次執行的隨機員工排名（穩定 tiebreaker）
  const randomRank: Record<string, number> = {};
  shuffle([...employees]).forEach((emp, i) => { randomRank[emp.id] = i; });

  const startDay = Math.floor(Math.random() * daysInMonth);

  const schedule: Record<string, (ShiftType | null)[]> = {};
  const workCounts: Record<string, number> = {};
  const offCounts: Record<string, number> = {};

  // 初始化 + 套用偏好設定
  for (const emp of employees) {
    schedule[emp.id] = Array(daysInMonth).fill(null);
    workCounts[emp.id] = 0;
    offCounts[emp.id] = 0;

    const prefs = preferences[emp.id] ?? {};
    for (const [dayStr, shift] of Object.entries(prefs)) {
      const d = parseInt(dayStr);
      if (d >= 0 && d < daysInMonth) {
        schedule[emp.id][d] = shift;
        if (shift === 'off') offCounts[emp.id]++;
        else workCounts[emp.id]++;
      }
    }
  }

  const WORK_SHIFTS: ('day' | 'night' | 'overnight')[] = ['day', 'night', 'overnight'];

  for (let i = 0; i < daysInMonth; i++) {
    const day = (startDay + i) % daysInMonth;
    const dayShifts = employees.map(e => schedule[e.id][day]);

    let dayCnt      = dayShifts.filter(s => s === 'day').length;
    let nightCnt    = dayShifts.filter(s => s === 'night').length;
    let overnightCnt = dayShifts.filter(s => s === 'overnight').length;

    const hasCoverage =
      dayCnt >= minPerShift && nightCnt >= minPerShift && overnightCnt >= minPerShift;

    // 覆蓋已足：剩餘員工填休或補白班
    if (hasCoverage) {
      for (const emp of employees) {
        if (schedule[emp.id][day] === null) {
          const forceRest =
            mustRestAfterOvernight(schedule[emp.id], day, previousTail[emp.id]) ||
            consecutiveWorkDaysBefore(schedule[emp.id], day, previousTail[emp.id]) >= 5;
          if (offCounts[emp.id] < emp.daysOffTarget || forceRest) {
            schedule[emp.id][day] = 'off';
            offCounts[emp.id]++;
          } else {
            schedule[emp.id][day] = 'day';
            workCounts[emp.id]++;
          }
        }
      }
      continue;
    }

    // ── 排序未排班員工 ────────────────────────────────────────
    const unassigned = employees.filter(e => schedule[e.id][day] === null);
    unassigned.sort((a, b) => {
      // 已達休假上限者優先上班
      const mustA = offCounts[a.id] >= a.daysOffTarget ? 0 : 1;
      const mustB = offCounts[b.id] >= b.daysOffTarget ? 0 : 1;
      if (mustA !== mustB) return mustA - mustB;
      // 連休天數少者優先上班
      const restA = consecutiveRestDaysBefore(schedule[a.id], day, previousTail[a.id]);
      const restB = consecutiveRestDaysBefore(schedule[b.id], day, previousTail[b.id]);
      if (restA !== restB) return restA - restB;
      return randomRank[a.id] - randomRank[b.id];
    });

    // 可排班的員工（< 5 連班 且 大夜後不強制上班）
    const eligible = unassigned.filter(e =>
      consecutiveWorkDaysBefore(schedule[e.id], day, previousTail[e.id]) < 5 &&
      !mustRestAfterOvernight(schedule[e.id], day, previousTail[e.id])
    );

    if (eligible.length === 0 && (dayCnt < minPerShift || nightCnt < minPerShift || overnightCnt < minPerShift)) {
      warnings.push({ day, message: `第 ${day + 1} 天：所有人員均無法排班` });
    }

    // 白班候選：額外排除「昨天上夜班」者
    const dayEligible = eligible.filter(
      e => !workedNightBefore(schedule[e.id], day, previousTail[e.id])
    );
    // 夜班/大夜班候選：同 eligible（夜班後可接夜班或大夜，但不能接白班）
    const nightEligible     = eligible;
    const overnightEligible = eligible;

    const assigned = new Set<string>();

    /** 從候選池中取 need 人排入 shiftType */
    const fillShift = (
      shiftType: 'day' | 'night' | 'overnight',
      pool: Employee[],
      currentCount: number,
    ): number => {
      const need = Math.max(0, minPerShift - currentCount);
      if (need === 0) return currentCount;

      const available = pool.filter(e => !assigned.has(e.id));
      // 有偏好的人優先
      const preferred = available.filter(e => e.shiftPreference === shiftType);
      const others    = available.filter(e => e.shiftPreference !== shiftType);
      const picked    = [...preferred, ...others].slice(0, need);

      for (const emp of picked) {
        schedule[emp.id][day] = shiftType;
        workCounts[emp.id]++;
        assigned.add(emp.id);
      }

      const actual = currentCount + picked.length;
      if (picked.length < need) {
        const label = shiftType === 'day' ? '白班' : shiftType === 'night' ? '夜班' : '大夜班';
        warnings.push({
          day,
          message: `第 ${day + 1} 天：缺${label}，需 ${minPerShift} 人，實際 ${actual} 人`,
        });
      }
      return actual;
    };

    // 最受限的班別優先填（可用人數 / 需求數 最小者先填）
    const shiftMeta = [
      { type: 'day'       as const, pool: dayEligible,       cnt: dayCnt },
      { type: 'night'     as const, pool: nightEligible,     cnt: nightCnt },
      { type: 'overnight' as const, pool: overnightEligible, cnt: overnightCnt },
    ].sort((a, b) => {
      const needA = Math.max(0, minPerShift - a.cnt);
      const needB = Math.max(0, minPerShift - b.cnt);
      if (needA === 0 && needB === 0) return 0;
      if (needA === 0) return 1;
      if (needB === 0) return -1;
      // 最少可用/需求比率 → 最受限 → 優先
      return (a.pool.length / needA) - (b.pool.length / needB);
    });

    for (const { type, pool, cnt } of shiftMeta) {
      if (type === 'day')
        dayCnt = fillShift('day', pool, cnt);
      else if (type === 'night')
        nightCnt = fillShift('night', pool, cnt);
      else
        overnightCnt = fillShift('overnight', pool, cnt);
    }

    // 填剩餘空格
    for (const emp of employees) {
      if (schedule[emp.id][day] === null) {
        const forceRest =
          mustRestAfterOvernight(schedule[emp.id], day, previousTail[emp.id]) ||
          consecutiveWorkDaysBefore(schedule[emp.id], day, previousTail[emp.id]) >= 5;
        if (offCounts[emp.id] < emp.daysOffTarget || forceRest) {
          schedule[emp.id][day] = 'off';
          offCounts[emp.id]++;
        } else {
          schedule[emp.id][day] = 'day';
          workCounts[emp.id]++;
        }
      }
    }
  }

  // ── 統計 ────────────────────────────────────────────────────
  const stats: Record<string, EmployeeStats> = {};
  for (const emp of employees) {
    let day = 0, night = 0, overnight = 0, full = 0, off = 0;
    let maxConsecutive = 0, cur = 0;

    for (const shift of schedule[emp.id]) {
      if (shift === 'day' || shift === 'night' || shift === 'overnight' || shift === 'full') {
        if (shift === 'day') day++;
        else if (shift === 'night') night++;
        else if (shift === 'overnight') overnight++;
        else full++;
        cur++;
      } else {
        off++;
        maxConsecutive = Math.max(maxConsecutive, cur);
        cur = 0;
      }
    }
    maxConsecutive = Math.max(maxConsecutive, cur);
    stats[emp.id] = { day, night, overnight, full, off, maxConsecutive };

    if (maxConsecutive > 5) {
      warnings.push({ day: -1, message: `${emp.name} 最長連班達 ${maxConsecutive} 天，超過 5 天上限` });
    }
  }

  return {
    schedule: schedule as GeneratedSchedule,
    warnings,
    stats,
    retryCount: 1,
  };
}
