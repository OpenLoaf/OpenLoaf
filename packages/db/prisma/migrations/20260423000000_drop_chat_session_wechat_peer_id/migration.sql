-- iLink Bot is strictly 1:1 — one WeChat account maps to exactly one peer
-- (the binding user themselves). Per-peer routing was an over-generalization
-- carried over from hermes-agent's multi-contact IM pattern.

DROP INDEX IF EXISTS "ChatSession_kind_wechatAccountId_wechatPeerId_key";
DROP INDEX IF EXISTS "ChatSession_kind_wechatAccountId_idx";

ALTER TABLE "ChatSession" DROP COLUMN "wechatPeerId";

CREATE UNIQUE INDEX "ChatSession_kind_wechatAccountId_key"
  ON "ChatSession"("kind", "wechatAccountId");
