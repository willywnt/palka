'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { loginAction } from '@/modules/auth/actions/login';
import { loginSchema, type LoginInput } from '@/modules/auth/validators/login';
import { AuthFormSkeleton } from '@/modules/auth/components/auth-form-skeleton';
import { ClientOnly } from '@/components/client-only';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    const formData = new FormData();
    formData.set('email', values.email);
    formData.set('password', values.password);
    if (callbackUrl) {
      formData.set('callbackUrl', callbackUrl);
    }

    const result = await loginAction(formData);

    if (!result.success) {
      toast.error('Gagal masuk', {
        description: result.message,
      });
      return;
    }

    toast.success('Berhasil masuk');
  }

  return (
    <ClientOnly fallback={<AuthFormSkeleton fields={2} />}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="nama@email.com"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </Form>
    </ClientOnly>
  );
}
