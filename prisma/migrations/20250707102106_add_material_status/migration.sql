-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "materialAvailable" BOOLEAN DEFAULT false,
ADD COLUMN     "materialOrderedByClient" BOOLEAN DEFAULT false,
ADD COLUMN     "materialOrderedByWorkshop" BOOLEAN DEFAULT false;
