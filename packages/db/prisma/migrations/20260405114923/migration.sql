-- CreateIndex
CREATE INDEX "Board_projectId_deletedAt_createdAt_idx" ON "Board"("projectId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarItem_sourceId_startAt_idx" ON "CalendarItem"("sourceId", "startAt");

-- CreateIndex
CREATE INDEX "ChatSession_projectId_deletedAt_createdAt_idx" ON "ChatSession"("projectId", "deletedAt", "createdAt");
