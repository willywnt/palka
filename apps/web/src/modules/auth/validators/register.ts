import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(128, 'Password maksimal 128 karakter');

export const registerSchema = z
  .object({
    email: z.string().trim().email('Alamat email tidak valid'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Konfirmasi password kamu dulu'),
    displayName: z.string().trim().max(100, 'Nama maksimal 100 karakter').optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Password dan konfirmasinya tidak sama',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
