-- CreateTable
CREATE TABLE "scheduled_job_lock" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "heldUntil" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
