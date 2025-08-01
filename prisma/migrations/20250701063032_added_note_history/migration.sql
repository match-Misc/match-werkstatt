/*
  Warnings:

  - You are about to drop the column `subTasks` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "subTasks",
ALTER COLUMN "revisionHistory" DROP NOT NULL,
ALTER COLUMN "revisionHistory" DROP DEFAULT;

-- CreateTable
CREATE TABLE "NoteHistory" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NoteHistory" ADD CONSTRAINT "NoteHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
