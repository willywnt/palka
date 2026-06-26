'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import { expenseKeys } from './expense-keys';
import { expenseTemplateKeys } from './expense-template-keys';
import type {
  ExpenseTemplateDetail,
  ExpenseTemplateListItem,
  GenerateRecurringResult,
} from '../types';
import type {
  CreateExpenseTemplateInput,
  GenerateRecurringInput,
  UpdateExpenseTemplateInput,
} from '../validators/expense-template';

export function useExpenseTemplatesQuery() {
  return useQuery({
    queryKey: expenseTemplateKeys.list(),
    queryFn: async () => {
      const result = await apiFetch<ExpenseTemplateListItem[]>(apiRoutes.expenseTemplates);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useCreateExpenseTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateExpenseTemplateInput) => {
      const result = await apiFetch<ExpenseTemplateDetail>(apiRoutes.expenseTemplates, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseTemplateKeys.all }),
  });
}

export function useUpdateExpenseTemplateMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateExpenseTemplateInput) => {
      const result = await apiFetch<ExpenseTemplateDetail>(`${apiRoutes.expenseTemplates}/${id}`, {
        method: 'PATCH',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseTemplateKeys.all }),
  });
}

export function useDeleteExpenseTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiFetch<{ id: string }>(`${apiRoutes.expenseTemplates}/${id}`, {
        method: 'DELETE',
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseTemplateKeys.all }),
  });
}

/** "Buat bulan ini" — materialize a month's expenses from the active templates (idempotent). */
export function useGenerateRecurringMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateRecurringInput) => {
      const result = await apiFetch<GenerateRecurringResult>(
        `${apiRoutes.expenseTemplates}/generate`,
        { method: 'POST', body: input },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      // New expense rows landed → refresh the ledger (the Net P&L report/card refetch on revisit).
      void queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      void queryClient.invalidateQueries({ queryKey: expenseTemplateKeys.all });
    },
  });
}
