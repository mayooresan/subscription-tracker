export function parseDate(isoString) {
  const [year, month, day] = isoString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addCycle(isoDateString, cycle) {
  const date = parseDate(isoDateString);
  const originalDay = date.getUTCDate();

  switch (cycle) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      return formatDate(date);

    case 'monthly':
      return addMonthsClamped(date, 1, originalDay);

    case 'quarterly':
      return addMonthsClamped(date, 3, originalDay);

    case 'yearly':
      return addMonthsClamped(date, 12, originalDay);

    default:
      throw new Error(`Unsupported billing cycle: ${cycle}`);
  }
}

function addMonthsClamped(date, monthsToAdd, targetDay) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  // Create first day of target month
  const target = new Date(Date.UTC(year, month + monthsToAdd, 1));

  // Find last day of target month
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();

  // Clamp day to max available days in that month
  target.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth));
  return formatDate(target);
}

export function advanceToNextFutureRenewal(isoDateString, cycle, referenceDate = formatDate(new Date())) {
  let current = isoDateString;
  while (current < referenceDate) {
    current = addCycle(current, cycle);
  }
  return current;
}

export function normalizeToMonthly(price, cycle) {
  const numPrice = Number(price) || 0;
  switch (cycle) {
    case 'weekly':
      return (numPrice * 52) / 12;
    case 'monthly':
      return numPrice;
    case 'quarterly':
      return numPrice / 3;
    case 'yearly':
      return numPrice / 12;
    default:
      return numPrice;
  }
}
