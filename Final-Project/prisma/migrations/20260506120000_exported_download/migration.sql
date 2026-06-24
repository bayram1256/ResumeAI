-- CreateTable
CREATE TABLE `ExportedDownload` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('IMPROVED_RESUME', 'COVER_LETTER') NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `template` VARCHAR(191) NULL,
    `content` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExportedDownload_userId_idx`(`userId`),
    INDEX `ExportedDownload_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExportedDownload` ADD CONSTRAINT `ExportedDownload_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
