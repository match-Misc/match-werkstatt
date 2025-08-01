/*
  Warnings:

  - The `titleImage` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "titleImageMimeType" TEXT,
DROP COLUMN "titleImage",
ADD COLUMN     "titleImage" BYTEA;
