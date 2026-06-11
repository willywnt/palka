'use server';

import { AuthError as NextAuthError } from 'next-auth';
import { headers } from 'next/headers';

import { signIn } from '@/auth';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  AuthError,
} from '@/modules/auth/errors/auth-errors';
import {
  isLoginBlocked,
  recordFailedLoginAttempt,
} from '@/modules/auth/services/auth-security.service';
import { resolveSafeCallbackUrl } from '@/modules/auth/utils/callback-url';
import { loginSchema } from '@/modules/auth/validators/login';
import type { AuthActionResult } from '@/modules/auth/types';
import { getRequestIp } from '@/lib/api/request-context';
import { assertRateLimitAllowed, enforceRateLimit } from '@/lib/api/rate-limit';

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      success: false,
      code: AUTH_ERROR_CODES.VALIDATION_ERROR,
      message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const headerStore = await headers();
  const ip = getRequestIp(new Request('http://local', { headers: headerStore }));

  try {
    assertRateLimitAllowed(await enforceRateLimit('login', { ip }));

    if (await isLoginBlocked(parsed.data.email, ip)) {
      return {
        success: false,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Terlalu banyak percobaan masuk yang gagal. Coba lagi beberapa menit lagi, ya.',
      };
    }

    const callbackField = formData.get('callbackUrl');
    const redirectTo = resolveSafeCallbackUrl(
      typeof callbackField === 'string' ? callbackField : null,
    );

    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof NextAuthError) {
      if (error.type === 'CredentialsSignin') {
        await recordFailedLoginAttempt(parsed.data.email, ip);
        return {
          success: false,
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          message: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
        };
      }
    }

    if (error instanceof AuthError) {
      return {
        success: false,
        code: error.code,
        message: error.message,
      };
    }

    throw error;
  }

  return { success: true };
}
