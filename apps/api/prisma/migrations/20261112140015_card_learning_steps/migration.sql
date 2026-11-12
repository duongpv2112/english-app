/*
  Warnings:

  - You are about to drop the column `elapsedDays` on the `Card` table. All the data in the column will be lost.
  - Added the required column `learningSteps` to the `Card` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Card" DROP COLUMN "elapsedDays",
ADD COLUMN     "learningSteps" INTEGER NOT NULL;
