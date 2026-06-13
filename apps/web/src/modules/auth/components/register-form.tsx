'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export function RegisterForm({ initialInviteCode }: { initialInviteCode?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      inviteCode: initialInviteCode?.toUpperCase() ?? '',
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
    if (values.inviteCode) {
      formData.set('inviteCode', values.inviteCode);
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
    <ClientOnly fallback={<AuthFormSkeleton fields={5} />}>
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
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="pr-10"
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground absolute top-0 right-0 h-full w-9"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
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
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="pr-10"
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground absolute top-0 right-0 h-full w-9"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="inviteCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Kode undangan{' '}
                  <span className="text-muted-foreground font-normal">(opsional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="8 karakter"
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={8}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Dapat kode dari pemilik toko? Masukkan di sini untuk gabung ke timnya.
                </FormDescription>
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
