-- CreateTable
CREATE TABLE "PendingCloudTask" (
    "toolCallId" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "boardId" TEXT,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PendingCloudTask_status_idx" ON "PendingCloudTask"("status");

-- CreateIndex
CREATE INDEX "PendingCloudTask_sessionId_idx" ON "PendingCloudTask"("sessionId");
