export interface DayGroup<T> {
  dateKey: string;
  dayLabel: string;
  isToday: boolean;
  isYesterday: boolean;
  items: T[];
  totalUnits: number;
}

export function groupItemsByDay<T>(
  items: T[],
  getDate: (item: T) => string | Date | undefined | null,
  getUnits?: (item: T) => number,
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  for (const item of items) {
    const rawDate = getDate(item);
    let dateKey = 'unspecified';
    let dateObj: Date | null = null;

    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        dateObj = d;
        dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }

    let group = groups.get(dateKey);
    if (!group) {
      const isToday = dateKey === todayStr;
      const isYesterday = dateKey === yesterdayStr;

      let dayLabel = 'Unspecified Date';
      if (dateObj) {
        const formatted = dateObj.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        if (isToday) {
          dayLabel = `Today · ${formatted}`;
        } else if (isYesterday) {
          dayLabel = `Yesterday · ${formatted}`;
        } else {
          dayLabel = formatted;
        }
      }

      group = {
        dateKey,
        dayLabel,
        isToday,
        isYesterday,
        items: [],
        totalUnits: 0,
      };
      groups.set(dateKey, group);
    }

    group.items.push(item);
    if (getUnits) {
      group.totalUnits += Number(getUnits(item) || 0);
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.dateKey === 'unspecified') return 1;
    if (b.dateKey === 'unspecified') return -1;
    return b.dateKey.localeCompare(a.dateKey);
  });
}
