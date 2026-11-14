-- CreateTable
CREATE TABLE "DictationAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exampleId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DictationAttempt_userId_exampleId_createdAt_idx" ON "DictationAttempt"("userId", "exampleId", "createdAt");

-- AddForeignKey
ALTER TABLE "DictationAttempt" ADD CONSTRAINT "DictationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictationAttempt" ADD CONSTRAINT "DictationAttempt_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "Example"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
