-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LATE_LOGIN', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_REQUESTED', 'EMPLOYEE_ADDED', 'EMPLOYEE_EXIT', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "ClientInteractionType" AS ENUM ('CALL', 'MEETING', 'NEW_CLIENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dateOfExit" DATE,
ADD COLUMN     "dateOfJoining" DATE,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "type" "ClientInteractionType" NOT NULL,
    "notes" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientInteraction_userId_timestamp_idx" ON "ClientInteraction"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInteraction" ADD CONSTRAINT "ClientInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
