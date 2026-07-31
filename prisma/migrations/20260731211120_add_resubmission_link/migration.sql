-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'code',
ADD COLUMN     "previousSubmissionId" TEXT;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_previousSubmissionId_fkey" FOREIGN KEY ("previousSubmissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
