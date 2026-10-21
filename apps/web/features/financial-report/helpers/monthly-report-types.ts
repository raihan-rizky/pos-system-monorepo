export type IncomeGroup = 'CETAK' | 'PLAT' | 'STEMPEL' | 'SPANDUK' | 'ATK' | 'PRINT' | 'UNMAPPED';
export type ExpenseGroup = 'CETAK_PLAT' | 'SPANDUK' | 'ATK' | 'OTHER' | 'SALARY';
export type MonthlyIncome = { id: string; date: string; reference: string; description: string; amounts: Record<IncomeGroup, number> };
export type MonthlyExpense = { id: string; date: string; description: string; amount: number; group: ExpenseGroup; purchase?: { reference: string; method: string | null; dueDate: string | null; supplier: string } };
export type MonthlyReceivable = { id: string; date: string; dueDate: string | null; reference: string; description: string; customer: string; amount: number };
export type MonthlyFinancialReport = { year: number; month: number; from: string; to: string; income: MonthlyIncome[]; expenses: MonthlyExpense[]; receivables: MonthlyReceivable[]; inventoryBalance: null; supplierDebtBalance: null; warnings: string[] };
