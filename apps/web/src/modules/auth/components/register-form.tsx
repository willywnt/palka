'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { registerAction } from '@/modules/auth/actions/register';
import { registerSchema, type RegisterInput } from '@/modules/auth/validators/register';
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

export function RegisterForm() {
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
    },
  });

  async function onSubmit(values: RegisterInput) {
    const formData = new FormData();
    formData.set('email', values.email);
    formData.set('password', values.password);
    formData.set('confirmPassword', values.confirmPassword);
    if (values.displayName) {
      formData.set('displayName', values.displayName);
    }

    const result = await registerAction(formData);

    if (!result.success) {
      toast.error('Gagal mendaftar', {
        description: result.message,
      });
      return;
    }

    toast.success('Akun berhasil dibuat');
  }

  return (
    <ClientOnly fallback={<AuthFormSkeleton fields={4} />}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Nama <span className="text-muted-foreground font-normal">(opsional)</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Nama kamu" autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Konfirmasi password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Membuat akun...' : 'Buat akun'}
          </Button>
        </form>
      </Form>
    </ClientOnly>
  );
}
