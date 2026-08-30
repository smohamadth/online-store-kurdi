-- CreateTable
CREATE TABLE "CsrfToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CsrfToken_sessionId_key" ON "CsrfToken"("sessionId");

-- CreateIndex
CREATE INDEX "CsrfToken_expiresAt_idx" ON "CsrfToken"("expiresAt");
