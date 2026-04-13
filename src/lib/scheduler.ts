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
  return new Date(year, month - 1, day).getDay(); // 0=日, 6=六
}

// 判斷是否為上班中（非休假）
function isWorking(shift: ShiftType | null): boolean {
  return shift !== null && shift !== 'off';
}

// 計算某天之前連續上班天數
function consecutiveWorkDaysBefore(schedule: (ShiftType | null)[], day: number): number {
  let count = 0;
  for (let d = day - 1; d >= 0; d--) {
    if (isWorking(schedule[d])) count++;
    else break;
  }
  return count;
}

// 計算某天之前連續休假天數
function consecutiveRestDaysBefore(schedule: (ShiftType | null)[], day: number): number {
  let count = 0;
  for (let d = day - 1; d >= 0; d--) {
    if (schedule[d] === 'off') count++;
    else break;
  }
  return count;
}

// 昨天是否上了夜班或全日班（影響今天能否上白班）
function workedNightBefore(schedule: (ShiftType | null)[], day: number): boolean {
  if (day === 0) return false;
  const prev = schedule[day - 1];
  return prev === 'night' || prev === 'full';
}

// 檢查當天的排班是否滿足覆蓋需求
function checkCoverage(shifts: (ShiftType | null)[]): { hasDay: boolean; hasNight: boolean } {
  const hasDay = shifts.some(s => s === 'day' || s === 'full');
  const hasNight = shifts.some(s => s === 'night' || s === 'full');
  return { hasDay, hasNight };
}

// 人力不足相關的警告關鍵字
const COVERAGE_WARNING_KEYWORDS = ['夜班人力不足', '缺白班', '缺夜班', '所有人員均無法排班'];

export function hasCoverageWarnings(warnings: ScheduleWarning[]): boolean {
  return warnings.some(w => COVERAGE_WARNING_KEYWORDS.some(kw => w.message.includes(kw)));
}

// 簡單線性同餘亂數產生器（LCG），可重現的 seeded PRNG
function createRng(seed: number): () => number {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Fisher-Yates 洗牌（回傳新陣列，不改動原陣列）
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateSchedule(
  employees: Employee[],
  year: number,
  month: number,
  preferences: Preferences,
  seed?: number
): ScheduleResult {
  const daysInMonth = getDaysInMonth(year, month);
  const warnings: ScheduleWarning[] = [];

  // 初始化排班矩陣（null = 尚未決定）
  const schedule: Record<string, (ShiftType | null)[]> = {};
  const workCounts: Record<string, number> = {};
  const offCounts: Record<string, number> = {};

  for (const emp of employees) {
    schedule[emp.id] = Array(daysInMonth).fill(null);
    workCounts[emp.id] = 0;
    offCounts[emp.id] = 0;

    // 套用手動偏好
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

  // 逐天排班
  for (let day = 0; day < daysInMonth; day++) {
    const dayShifts = employees.map(e => schedule[e.id][day]);
    const { hasDay, hasNight } = checkCoverage(dayShifts);

    // 已滿足覆蓋 → 其餘人補休
    if (hasDay && hasNight) {
      for (const emp of employees) {
        if (schedule[emp.id][day] === null) {
          schedule[emp.id][day] = 'off';
          offCounts[emp.id]++;
        }
      }
      continue;
    }

    // 找出尚未指定班別的員工
    // 先用 seed 洗牌（每天用不同子 seed），再 stable sort 依規則排序
    // stable sort 保證：條件相同的員工，順序由洗牌決定 → 每個 seed 產生不同排法
    const rng = createRng((seed ?? 0) * 10000 + day);
    const unassigned = shuffle(
      employees.filter(e => schedule[e.id][day] === null),
      rng,
    );

    unassigned.sort((a, b) => {
      // 1. 連休天數少的優先上班（讓連休的人繼續休，休假自然集中）
      const restA = consecutiveRestDaysBefore(schedule[a.id], day);
      const restB = consecutiveRestDaysBefore(schedule[b.id], day);
      if (restA !== restB) return restA - restB;
      // 2. 連續上班天數少的優先（避免過長連班）
      const consA = consecutiveWorkDaysBefore(schedule[a.id], day);
      const consB = consecutiveWorkDaysBefore(schedule[b.id], day);
      if (consA !== consB) return consA - consB;
      // 3. 剩餘工作配額多的優先
      const budgetA = (daysInMonth - a.daysOffTarget) - workCounts[a.id];
      const budgetB = (daysInMonth - b.daysOffTarget) - workCounts[b.id];
      return budgetB - budgetA;
      // 以上條件相同時：維持洗牌後的順序（stable sort 特性）
    });

    // 符合「未超過5連班」的員工
    const eligible = unassigned.filter(
      e => consecutiveWorkDaysBefore(schedule[e.id], day) < 5
    );
    const pool = eligible.length > 0 ? eligible : unassigned;
    const isForced = eligible.length === 0 && unassigned.length > 0;

    // 「可上白班」：昨天沒上夜班或全日班
    const dayPool = pool.filter(e => !workedNightBefore(schedule[e.id], day));
    const nightForcedForDay = dayPool.length === 0 && pool.length > 0;

    const needDay = !hasDay;
    const needNight = !hasNight;

    if (needDay && needNight) {
      if (pool.length === 0) {
        warnings.push({ day, message: `第 ${day + 1} 天：所有人員均無法排班` });
      } else if (pool.length === 1) {
        // 只剩一人，排白班；若有夜班限制照警告提示
        const emp = pool[0];
        schedule[emp.id][day] = 'day';
        workCounts[emp.id]++;
        if (nightForcedForDay) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 昨日夜班後仍需排白班（人力不足）` });
        warnings.push({ day, message: `第 ${day + 1} 天：夜班人力不足，可在結果頁圈選全日班後重新排班` });
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 突破 5 連班限制` });
      } else {
        // 白班優先從「可上白班」的人選；夜班從剩餘人選
        const dayEmp = dayPool.length > 0 ? dayPool[0] : pool[0];
        const nightEmp = pool.find(e => e.id !== dayEmp.id)!;
        schedule[dayEmp.id][day] = 'day';
        schedule[nightEmp.id][day] = 'night';
        workCounts[dayEmp.id]++;
        workCounts[nightEmp.id]++;
        if (nightForcedForDay) warnings.push({ day, message: `第 ${day + 1} 天：${dayEmp.name} 昨日夜班後仍需排白班（人力不足）` });
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：人力不足，突破 5 連班限制` });
      }
    } else if (needDay) {
      const candidates = dayPool.length > 0 ? dayPool : pool;
      if (candidates.length > 0) {
        const emp = candidates[0];
        schedule[emp.id][day] = 'day';
        workCounts[emp.id]++;
        if (nightForcedForDay) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 昨日夜班後仍需排白班（人力不足）` });
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 突破 5 連班限制（補白班）` });
      } else {
        warnings.push({ day, message: `第 ${day + 1} 天：缺白班，無可用人員` });
      }
    } else if (needNight) {
      if (pool.length > 0) {
        const emp = pool[0];
        schedule[emp.id][day] = 'night';
        workCounts[emp.id]++;
        if (isForced) warnings.push({ day, message: `第 ${day + 1} 天：${emp.name} 突破 5 連班限制（補夜班）` });
      } else {
        warnings.push({ day, message: `第 ${day + 1} 天：缺夜班，無可用人員` });
      }
    }

    // 剩餘未指定 → 休假
    for (const emp of employees) {
      if (schedule[emp.id][day] === null) {
        schedule[emp.id][day] = 'off';
        offCounts[emp.id]++;
      }
    }
  }

  // 計算統計數據
  const stats: Record<string, EmployeeStats> = {};
  for (const emp of employees) {
    let day = 0, night = 0, full = 0, off = 0;
    let maxConsecutive = 0, currentConsecutive = 0;

    for (const shift of schedule[emp.id]) {
      if (shift === 'day')        { day++;   currentConsecutive++; }
      else if (shift === 'night') { night++;  currentConsecutive++; }
      else if (shift === 'full')  { full++;   currentConsecutive++; }
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
