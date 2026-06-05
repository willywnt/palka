import { z } from 'zod';

import { noResiSchema } from '@/modules/recordings/validators/no-resi';

export const pairingIdSchema = z.string().uuid('Invalid pairing session id');

/** Secret from QR (`code` query param); matches server-generated pairingCode. */
export const pairingCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(16, 'Invalid pairing code').max(64, 'Invalid pairing code'),
);

/** Which station a new pairing drives; defaults to recordings for back-compat. */
export const pairingPurposeSchema = z.enum(['RECORDING', 'POS']);

export const createPairingSchema = z.object({
  purpose: pairingPurposeSchema.default('RECORDING'),
});

export const connectPairingSchema = z.object({
  pairingId: pairingIdSchema,
  deviceInfo: z
    .object({
      userAgent: z.string().max(512).optional(),
      platform: z.string().max(128).optional(),
      language: z.string().max(32).optional(),
      screen: z.string().max(64).optional(),
    })
    .optional(),
});

export const submitBarcodeSchema = z.object({
  pairingId: pairingIdSchema,
  barcode: noResiSchema,
});

export const joinPairingSocketSchema = z.object({
  pairingId: pairingIdSchema,
  role: z.enum(['desktop', 'mobile']),
});

export const stationRecordingPhaseSchema = z.enum(['idle', 'countdown', 'recording', 'uploading']);

export const reportStationStateSchema = z.object({
  pairingId: pairingIdSchema,
  phase: stationRecordingPhaseSchema,
  barcode: noResiSchema.optional(),
});

export type CreatePairingInput = z.infer<typeof createPairingSchema>;
export type ConnectPairingInput = z.infer<typeof connectPairingSchema>;
export type SubmitBarcodeInput = z.infer<typeof submitBarcodeSchema>;
export type JoinPairingSocketInput = z.infer<typeof joinPairingSocketSchema>;
