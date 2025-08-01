-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "revisionHistory" JSONB NOT NULL DEFAULT '[]';
