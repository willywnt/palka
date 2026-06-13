'use server';

import { AuthError as NextAuthError } from 'next-auth';
import { Prisma } from '@prisma/client';

import { signIn } from '@/auth';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  AuthError,
} from '@/modules/auth/errors/auth-errors';
import { authService } from '@/modules/auth/services/auth.service';
import { registerSchema } from '@/modules/auth/validators/register';
import type { AuthActionResult } from '@/modules/auth/types';

export async function registerAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    displayName: formData.get('displayName') || undefined,
    inviteCode: formData.get('inviteCode') || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      code: AUTH_ERROR_CODES.VALIDATION_ERROR,
      message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await authService.registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
      inviteCode: parsed.data.inviteCode,
    });

    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        success: false,
        code: error.code,
        message: error.message,
      };
    }

    if (error instanceof NextAuthError) {
      return {
        success: false,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        success: false,
        code: AUTH_ERROR_CODES.EMAIL_TAKEN,
        message: AUTH_ERROR_MESSAGES.EMAIL_TAKEN,
      };
    }

    throw error;
  }

  return { success: true };
}
