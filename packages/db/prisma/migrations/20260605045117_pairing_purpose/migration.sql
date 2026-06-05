-- CreateEnum
CREATE TYPE "PairingPurpose" AS ENUM ('RECORDING', 'POS');

-- AlterTable
ALTER TABLE "pairing_sessions" ADD COLUMN     "purpose" "PairingPurpose" NOT NULL DEFAULT 'RECORDING';
