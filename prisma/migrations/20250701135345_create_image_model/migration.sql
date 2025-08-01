/*
  Warnings:

  - You are about to drop the column `titleImage` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `titleImageMimeType` on the `Order` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[titleImageId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "titleImage",
DROP COLUMN "titleImageMimeType",
ADD COLUMN     "titleImageId" TEXT;

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_titleImageId_key" ON "Order"("titleImageId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_titleImageId_fkey" FOREIGN KEY ("titleImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;
