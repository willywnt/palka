import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LoginForm } from '@/modules/auth/components/login-form';
import { AuthFormSkeleton } from '@/modules/auth/components/auth-form-skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Masuk',
};

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Selamat datang kembali</CardTitle>
        <CardDescription>Masuk ke akun Falka kamu</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<AuthFormSkeleton fields={2} />}>
          <LoginForm />
        </Suspense>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Belum punya akun?{' '}
          <Link
            href="/register"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Buat akun
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
