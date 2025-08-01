-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "canEdit" BOOLEAN DEFAULT false,
ADD COLUMN     "confirmationDate" TIMESTAMP(3),
ADD COLUMN     "confirmationNote" TEXT,
ADD COLUMN     "reworkComments" JSONB,
ALTER COLUMN "priority" SET DEFAULT 'medium',
ALTER COLUMN "status" SET DEFAULT 'pending';
