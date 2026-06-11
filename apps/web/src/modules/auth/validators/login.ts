import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Alamat email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
});

export type LoginInput = z.infer<typeof loginSchema>;
