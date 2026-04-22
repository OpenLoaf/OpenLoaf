-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "kind" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "wechatAccountId" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "wechatPeerId" TEXT;

-- CreateIndex
CREATE INDEX "ChatSession_kind_wechatAccountId_idx" ON "ChatSession"("kind", "wechatAccountId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ChatSession_kind_wechatAccountId_wechatPeerId_key" ON "ChatSession"("kind", "wechatAccountId", "wechatPeerId");
