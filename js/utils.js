// Spendly — Categories, Date Utilities, Formatting & Calculation Engine

export const CATEGORIES = [
  { name: 'Food', color: '#E06D53', bg: 'rgba(224, 109, 83, 0.14)', icon: 'utensils' },
  { name: 'Transportation', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.14)', icon: 'car' },
  { name: 'Shopping', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.14)', icon: 'bag' },
  { name: 'Education', color: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.14)', icon: 'book' },
  { name: 'Entertainment', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.14)', icon: 'film' },
  { name: 'Mobile Recharge', color: '#14B8A6', bg: 'rgba(20, 184, 166, 0.14)', icon: 'phone' },
  { name: 'Electricity & Bills', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.14)', icon: 'bolt' },
  { name: 'Medical', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.14)', icon: 'heart' },
  { name: 'Groceries', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.14)', icon: 'cart' },
  { name: 'Personal Care', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.14)', icon: 'sparkles' },
  { name: 'Travel', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.14)', icon: 'plane' },
  { name: 'Other', color: '#64748B', bg: 'rgba(100, 116, 139, 0.14)', icon: 'dots' }
];

export const PAYMENT_METHODS = [
  'Cash',
  'UPI',
  'Debit Card',
  'Credit Card',
  'Bank Transfer',
  'Other'
];

export const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN', code: 'INR', label: 'Indian Rupee (₹)' },
  USD: { symbol: '$', locale: 'en-US', code: 'USD', label: 'US Dollar ($)' },
  EUR: { symbol: '€', locale: 'en-IE', code: 'EUR', label: 'Euro (€)' },
  GBP: { symbol: '£', locale: 'en-GB', code: 'GBP', label: 'British Pound (£)' }
};

export function getCurrencyPreference() {
  const code = localStorage.getItem('spendly_currency') || 'INR';
  return CURRENCIES[code] ? code : 'INR';
}

export function setCurrencyPreference(code) {
  if (CURRENCIES[code]) {
    localStorage.setItem('spendly_currency', code);
  }
}

export function formatCurrency(amount) {
  const numeric = Number(amount) || 0;
  const pref = CURRENCIES[getCurrencyPreference()];
  const hasDecimals = Math.round(numeric * 100) % 100 !== 0;
  return `${pref.symbol}${new Intl.NumberFormat(pref.locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  }).format(numeric)}`;
}

export function getCategoryMeta(categoryName) {
  return CATEGORIES.find((c) => c.name === categoryName) || CATEGORIES[CATEGORIES.length - 1];
}

// Local-timezone YYYY-MM-DD helpers
export function toLocalDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function formatDisplayDate(dateStr, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return parseLocalDate(dateStr).toLocaleDateString('en-IN', options);
}

export function formatFullDate(date = new Date()) {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// Monday is the first day of the week
export function getMondayOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

export function getSundayOfWeek(mondayDate) {
  const d = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate(), 23, 59, 59, 999);
  d.setDate(d.getDate() + 6);
  return d;
}

export function getMonthRange(year, monthIndex) {
  const first = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const last = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return {
    startStr: toLocalDateStr(first),
    endStr: toLocalDateStr(last),
    daysInMonth: last.getDate()
  };
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Calculation Engine
export function sumExpenses(expenses = []) {
  const totalPaise = expenses.reduce((sum, item) => sum + Math.round((Number(item.amount) || 0) * 100), 0);
  return totalPaise / 100;
}

export function normalizeDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return toLocalDateStr(d);
  return String(d).slice(0, 10);
}

export function sortExpensesNewestFirst(expenses = []) {
  return [...expenses].sort((a, b) => {
    const aDate = normalizeDate(a.date);
    const bDate = normalizeDate(b.date);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aMs = Number(a.createdAt) || (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
    const bMs = Number(b.createdAt) || (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
    return bMs - aMs;
  });
}

export function filterExpensesByDate(expenses = [], dateStr) {
  const target = normalizeDate(dateStr);
  return sortExpensesNewestFirst(expenses.filter((e) => normalizeDate(e.date) === target));
}

export function filterExpensesByDateRange(expenses = [], startStr, endStr) {
  const start = normalizeDate(startStr);
  const end = normalizeDate(endStr);
  return sortExpensesNewestFirst(
    expenses.filter((e) => {
      const d = normalizeDate(e.date);
      return d && d >= start && d <= end;
    })
  );
}

export function groupByCategory(expenses = []) {
  const total = sumExpenses(expenses);
  const map = new Map();
  for (const exp of expenses) {
    const cat = exp.category || 'Other';
    const current = map.get(cat) || { category: cat, amount: 0, count: 0 };
    current.amount = (Math.round(current.amount * 100) + Math.round((Number(exp.amount) || 0) * 100)) / 100;
    current.count += 1;
    map.set(cat, current);
  }
  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      meta: getCategoryMeta(entry.category),
      percentage: total > 0 ? Math.round((entry.amount / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function calculateDailySummary(expenses = [], dateStr = toLocalDateStr()) {
  const items = filterExpensesByDate(expenses, dateStr);
  const total = sumExpenses(items);
  const highestExpense = items.reduce(
    (max, item) => (!max || Number(item.amount) > Number(max.amount) ? item : max),
    null
  );
  return {
    dateStr,
    total,
    count: items.length,
    highestExpense,
    categoryBreakdown: groupByCategory(items),
    items
  };
}

export function calculateWeeklySummary(expenses = [], referenceDate = new Date()) {
  const monday = getMondayOfWeek(referenceDate);
  const sunday = getSundayOfWeek(monday);
  const startStr = toLocalDateStr(monday);
  const endStr = toLocalDateStr(sunday);
  const items = filterExpensesByDateRange(expenses, startStr, endStr);
  const total = sumExpenses(items);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyTotals = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dStr = toLocalDateStr(d);
    const dayItems = items.filter((e) => e.date === dStr);
    dailyTotals.push({
      dayName: dayNames[i],
      dateStr: dStr,
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      total: sumExpenses(dayItems),
      count: dayItems.length
    });
  }

  const highestDay = dailyTotals.reduce(
    (max, d) => (d.total > max.total ? d : max),
    { dayName: '—', total: 0, dateStr: '' }
  );

  return {
    startStr,
    endStr,
    monday,
    sunday,
    total,
    count: items.length,
    averageDaily: Math.round((total / 7) * 100) / 100,
    highestDay: highestDay.total > 0 ? highestDay : null,
    dailyTotals,
    categoryBreakdown: groupByCategory(items),
    items
  };
}

export function calculateMonthlySummary(expenses = [], year, monthIndex) {
  const { startStr, endStr, daysInMonth } = getMonthRange(year, monthIndex);
  const items = filterExpensesByDateRange(expenses, startStr, endStr);
  const total = sumExpenses(items);
  const categoryBreakdown = groupByCategory(items);

  const dailyTotals = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayItems = items.filter((e) => e.date === dStr);
    dailyTotals.push({
      day,
      dateStr: dStr,
      total: sumExpenses(dayItems),
      count: dayItems.length
    });
  }

  const highestDay = dailyTotals.reduce(
    (max, d) => (d.total > max.total ? d : max),
    { day: 0, total: 0, dateStr: '' }
  );

  return {
    year,
    monthIndex,
    startStr,
    endStr,
    daysInMonth,
    total,
    count: items.length,
    averageDaily: Math.round((total / daysInMonth) * 100) / 100,
    highestCategory: categoryBreakdown[0] || null,
    highestDay: highestDay.total > 0 ? highestDay : null,
    dailyTotals,
    categoryBreakdown,
    items
  };
}

export function compareMonths(expenses = [], year, monthIndex) {
  const current = calculateMonthlySummary(expenses, year, monthIndex);
  const prevDate = new Date(year, monthIndex - 1, 1);
  const previous = calculateMonthlySummary(expenses, prevDate.getFullYear(), prevDate.getMonth());
  const diff = Math.round((current.total - previous.total) * 100) / 100;
  let percentChange = 0;
  if (previous.total > 0) {
    percentChange = Math.round(((current.total - previous.total) / previous.total) * 1000) / 10;
  } else if (current.total > 0) {
    percentChange = 100;
  }
  return {
    currentTotal: current.total,
    previousTotal: previous.total,
    previousLabel: prevDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    diff,
    percentChange,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  };
}

export function calculateBudgetMetrics(spent, limit) {
  const budget = Number(limit) || 0;
  const spentVal = Number(spent) || 0;
  if (budget <= 0) {
    return { budget: 0, spent: spentVal, remaining: 0, percent: 0, status: 'unset' };
  }
  const remaining = Math.round((budget - spentVal) * 100) / 100;
  const percent = Math.round((spentVal / budget) * 1000) / 10;
  let status = 'ok';
  if (spentVal > budget) status = 'exceeded';
  else if (percent >= 80) status = 'warning';
  return { budget, spent: spentVal, remaining, percent, status };
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function exportExpensesToCSV(expenses = [], filename = 'spendly-expenses.csv') {
  const headers = ['Date', 'Title', 'Category', 'Payment Method', 'Amount', 'Notes'];
  const rows = sortExpensesNewestFirst(expenses).map((e) => [
    escapeCsvCell(e.date),
    escapeCsvCell(e.title),
    escapeCsvCell(e.category),
    escapeCsvCell(e.paymentMethod),
    escapeCsvCell(Number(e.amount || 0).toFixed(2)),
    escapeCsvCell(e.notes || '')
  ]);
  const csv = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function generateMonthlyPDFReport({ summary, comparison, year, monthIndex, userName }) {
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  });

  if (!window.jspdf?.jsPDF) {
    window.print();
    return false;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const code = getCurrencyPreference();
  const fmt = (n) => `${code} ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  pdf.setFillColor(22, 75, 59);
  pdf.rect(0, 0, pageWidth, 84, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('Spendly', 40, 40);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`Monthly Expense Report — ${monthLabel}`, 40, 60);
  pdf.text(userName || 'Spendly User', pageWidth - 40, 60, { align: 'right' });

  pdf.setTextColor(32, 41, 35);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('Summary', 40, 118);

  const lines = [
    ['Total Spending:', fmt(summary.total)],
    ['Transactions:', String(summary.count)],
    ['Daily Average:', fmt(summary.averageDaily)],
    ['Top Category:', summary.highestCategory ? `${summary.highestCategory.category} (${fmt(summary.highestCategory.amount)})` : 'N/A'],
    ['Vs Previous Month:', `${fmt(comparison.previousTotal)} (${comparison.diff >= 0 ? '+' : ''}${comparison.percentChange}%)`]
  ];

  pdf.setFontSize(10.5);
  let y = 140;
  for (const [k, v] of lines) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(k, 40, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(v, 165, y);
    y += 18;
  }

  if (pdf.autoTable) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Category Breakdown', 40, y + 16);
    pdf.autoTable({
      startY: y + 26,
      head: [['Category', 'Count', 'Share', `Amount (${code})`]],
      body: summary.categoryBreakdown.map((c) => [
        c.category,
        String(c.count),
        `${c.percentage}%`,
        Number(c.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      ]),
      headStyles: { fillColor: [22, 75, 59] },
      margin: { left: 40, right: 40 }
    });

    const nextY = pdf.lastAutoTable.finalY + 24;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Transactions', 40, nextY);
    pdf.autoTable({
      startY: nextY + 10,
      head: [['Date', 'Title', 'Category', 'Method', `Amount (${code})`]],
      body: summary.items.map((e) => [
        e.date,
        e.title,
        e.category,
        e.paymentMethod,
        Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      ]),
      headStyles: { fillColor: [53, 166, 111] },
      margin: { left: 40, right: 40 },
      styles: { fontSize: 9 }
    });
  }

  pdf.save(`spendly-report-${year}-${String(monthIndex + 1).padStart(2, '0')}.pdf`);
  return true;
}
