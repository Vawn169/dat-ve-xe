-- AlterTable
ALTER TABLE "buses" ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "operators" ADD COLUMN     "logo_url" TEXT;
