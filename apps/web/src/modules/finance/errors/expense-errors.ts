import { DomainError } from '@/lib/errors';

export const EXPENSE_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ExpenseErrorCode = (typeof EXPENSE_ERROR_CODES)[keyof typeof EXPENSE_ERROR_CODES];

export class ExpenseError extends DomainError {
  declare readonly code: ExpenseErrorCode;

  constructor(code: ExpenseErrorCode, message: string, statusCode = 400) {
    super(code, message, statusCode);
    this.name = 'ExpenseError';
  }

  static validation(message: string) {
    return new ExpenseError(EXPENSE_ERROR_CODES.VALIDATION_ERROR, message, 400);
  }

  static notFound(message = 'Expense not found.') {
    return new ExpenseError(EXPENSE_ERROR_CODES.NOT_FOUND, message, 404);
  }
}
