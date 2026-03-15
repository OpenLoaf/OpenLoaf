-- AlterTable: Add colorIndex to Board
ALTER TABLE "Board" ADD COLUMN "colorIndex" INTEGER;

-- AlterTable: Add colorIndex to Project
ALTER TABLE "Project" ADD COLUMN "colorIndex" INTEGER;
