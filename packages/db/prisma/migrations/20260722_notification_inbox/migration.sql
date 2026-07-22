CREATE TABLE "pos_notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT,
  "eventName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT,
  "tag" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_notifications_userId_eventName_tag_key"
  ON "pos_notifications"("userId", "eventName", "tag");

CREATE INDEX "pos_notifications_userId_readAt_createdAt_idx"
  ON "pos_notifications"("userId", "readAt", "createdAt" DESC);

CREATE INDEX "pos_notifications_storeId_createdAt_idx"
  ON "pos_notifications"("storeId", "createdAt" DESC);

ALTER TABLE "pos_notifications"
  ADD CONSTRAINT "pos_notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "pos_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_notifications"
  ADD CONSTRAINT "pos_notifications_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
