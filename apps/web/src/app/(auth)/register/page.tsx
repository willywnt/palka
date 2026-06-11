import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from '@/modules/auth/components/register-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Buat akun',
};

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Buat akun</CardTitle>
        <CardDescription>Mulai pakai Falka</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Sudah punya akun?{' '}
          <Link
            href="/login"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
