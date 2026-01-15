import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../src/utils.js';

export interface IntegrityCheck {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalFiles: number;
    totalSize: number;
    checksums: Map<string, string>;
    duplicates: string[];
    missingFiles: string[];
    corruptedFiles: string[];
  };
}

export interface BackupInfo {
  timestamp: string;
  path: string;
  size: number;
  checksum: string;
  compression: boolean;
}

export class DataIntegrityValidator {
  private logger: Logger;
  private checksumCache = new Map<string, string>();
  private backupHistory: BackupInfo[] = [];
  private maxBackups = 10;

  constructor() {
    this.logger = new Logger("DataIntegrityValidator");
  }

  async validateIntegrity(indexPath: string, options: {
    checkChecksums?: boolean;
    verifyFileContents?: boolean;
    checkBackups?: boolean;
    fastMode?: boolean;
  } = {}): Promise<IntegrityCheck> {
    const {
      checkChecksums = true,
      verifyFileContents = true,
      checkBackups = true,
      fastMode = false,
    } = options;

    const check: IntegrityCheck = {
      valid: true,
      errors: [],
      warnings: [],
      stats: {
        totalFiles: 0,
        totalSize: 0,
        checksums: new Map(),
        duplicates: [],
        missingFiles: [],
        corruptedFiles: [],
      },
    };

    try {
      // Load index file
      const indexData = await this.loadIndexData(indexPath);
      check.stats.totalFiles = Object.keys(indexData.files || {}).length;
      check.stats.totalSize = indexData.metadata?.sizeBytes || 0;

      if (!indexData.metadata) {
        check.valid = false;
        check.errors.push("Index metadata missing");
        return check;
      }

      // Validate index structure
      this.validateIndexStructure(indexData, check);

      if (!check.valid && fastMode) {
        return check;
      }

      // Check file existence and integrity
      if (verifyFileContents) {
        await this.verifyFiles(indexData, check, { checkChecksums, fastMode });
      }

      // Check backup integrity
      if (checkBackups) {
        await this.checkBackupIntegrity(indexPath, check);
      }

      // Check for duplicates
      this.findDuplicates(indexData, check);

      // Validate metadata consistency
      this.validateMetadata(indexData, check);

      // Cache checksums for future use
      if (checkChecksums) {
        await this.cacheChecksums(indexPath, indexData, check);
      }

      this.logger.info(`Integrity check completed: ${check.valid ? 'PASSED' : 'FAILED'}`, {
        errors: check.errors.length,
        warnings: check.warnings.length,
        files: check.stats.totalFiles,
        size: check.stats.totalSize,
      });

    } catch (error) {
      check.valid = false;
      check.errors.push(`Validation failed: ${error.message}`);
      this.logger.error("Integrity validation failed:", error);
    }

    return check;
  }

  async createBackup(indexPath: string, options: {
    compression?: boolean;
    includeChecksums?: boolean;
    backupPath?: string;
  } = {}): Promise<BackupInfo> {
    const {
      compression = true,
      includeChecksums = true,
      backupPath,
    } = options;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(indexPath, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const backupFileName = `backup-${timestamp}${compression ? '.json.gz' : '.json'}`;
      const backupPathFull = backupPath || path.join(backupDir, backupFileName);

      // Create backup
      if (compression) {
        const content = await fs.readFile(path.join(indexPath, 'index.json'));
        const compressed = await this.gzip(content);
        await fs.writeFile(backupPathFull, compressed);
      } else {
        await fs.copyFile(path.join(indexPath, 'index.json'), backupPathFull);
      }

      // Calculate checksum
      const checksum = await this.calculateChecksum(backupPathFull);

      // Create backup info
      const stats = await fs.stat(backupPathFull);
      const backupInfo: BackupInfo = {
        timestamp,
        path: backupPathFull,
        size: stats.size,
        checksum,
        compression,
      };

      // Add to backup history
      this.backupHistory.push(backupInfo);
      if (this.backupHistory.length > this.maxBackups) {
        this.backupHistory.shift();
      }

      // Update backup manifest
      await this.updateBackupManifest(indexPath, backupInfo);

      this.logger.info(`Backup created: ${backupPathFull} (${stats.size} bytes)`);
      return backupInfo;

    } catch (error) {
      this.logger.error(`Failed to create backup: ${error.message}`);
      throw error;
    }
  }

  async restoreFromBackup(indexPath: string, backupTimestamp?: string): Promise<boolean> {
    try {
      if (!backupTimestamp) {
        // Restore from latest backup
        if (this.backupHistory.length === 0) {
          throw new Error("No backups available");
        }
        backupTimestamp = this.backupHistory[this.backupHistory.length - 1].timestamp;
      }

      const backup = this.backupHistory.find(b => b.timestamp === backupTimestamp);
      if (!backup) {
        throw new Error(`Backup not found for timestamp: ${backupTimestamp}`);
      }

      // Verify backup checksum
      const currentChecksum = await this.calculateChecksum(backup.path);
      if (currentChecksum !== backup.checksum) {
        throw new Error(`Backup corrupted: checksum mismatch`);
      }

      // Restore the backup
      await fs.mkdir(indexPath, { recursive: true });
      const targetPath = path.join(indexPath, 'index.json');

      if (backup.compression) {
        const compressed = await fs.readFile(backup.path);
        const decompressed = await this.gunzip(compressed);
        await fs.writeFile(targetPath, decompressed);
      } else {
        await fs.copyFile(backup.path, targetPath);
      }

      this.logger.info(`Restored from backup: ${backup.path}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to restore from backup: ${error.message}`);
      throw error;
    }
  }

  async compareBackup(indexPath: string, backupTimestamp?: string): Promise<{
    differences: string[];
    backupSize: number;
    currentSize: number;
    compressionRatio: number;
  }> {
    try {
      const timestamp = backupTimestamp || this.backupHistory[this.backupHistory.length - 1]?.timestamp;
      if (!timestamp) {
        throw new Error("No backups to compare");
      }

      const backup = this.backupHistory.find(b => b.timestamp === timestamp);
      if (!backup) {
        throw new Error(`Backup not found: ${timestamp}`);
      }

      // Read current index
      const currentPath = path.join(indexPath, 'index.json');
      const currentContent = await fs.readFile(currentPath);
      const currentSize = currentContent.length;

      // Read backup
      const backupContent = backup.compressed
        ? await this.gunzip(await fs.readFile(backup.path))
        : await fs.readFile(backup.path);
      const backupSize = backupContent.length;

      const compressionRatio = backup.compressed ? backupSize / backup.size : 1;

      // Compare contents
      const differences: string[] = [];
      const currentData = JSON.parse(currentContent.toString());
      const backupData = JSON.parse(backupContent.toString());

      differences.push(...this.compareObjects(currentData, backupData, ''));

      return {
        differences,
        backupSize,
        currentSize,
        compressionRatio,
      };

    } catch (error) {
      this.logger.error(`Failed to compare backup: ${error.message}`);
      throw error;
    }
  }

  async cleanup(indexPath: string, options: {
    removeCorrupted?: boolean;
    consolidateBackups?: boolean;
    maxBackups?: number;
  } = {}): Promise<{
    removedFiles: number;
    removedBackups: number;
    freedSpace: number;
    consolidated: boolean;
  }> {
    const {
      removeCorrupted = true,
      consolidateBackups = true,
      maxBackups = 5,
    } = options;

    let removedFiles = 0;
    let removedBackups = 0;
    let freedSpace = 0;
    let consolidated = false;

    try {
      // Validate current integrity
      const integrityCheck = await this.validateIntegrity(indexPath, {
        fastMode: true,
      });

      // Remove corrupted files if requested
      if (removeCorrupted && integrityCheck.stats.corruptedFiles.length > 0) {
        for (const file of integrityCheck.stats.corruptedFiles) {
          try {
            await fs.unlink(file);
            removedFiles++;
            freedSpace += integrityCheck.stats.totalSize / integrityCheck.stats.totalFiles;
            this.logger.info(`Removed corrupted file: ${file}`);
          } catch (error) {
            this.logger.warn(`Failed to remove corrupted file ${file}: ${error.message}`);
          }
        }
      }

      // Consolidate backups
      if (consolidateBackups && this.backupHistory.length > maxBackups) {
        const backupsToKeep = this.backupHistory.slice(-maxBackups);
        const backupsToRemove = this.backupHistory.slice(0, -maxBackups);

        for (const backup of backupsToRemove) {
          try {
            await fs.unlink(backup.path);
            removedBackups++;
            freedSpace += backup.size;
            this.logger.info(`Removed old backup: ${backup.path}`);
          } catch (error) {
            this.logger.warn(`Failed to remove backup ${backup.path}: ${error.message}`);
          }
        }

        this.backupHistory = backupsToKeep;
        consolidated = true;

        // Update manifest
        await this.updateBackupManifest(indexPath, undefined, true);
      }

      this.logger.info(`Cleanup completed: removed ${removedFiles} files, ${removedBackups} backups, freed ${freedSpace} bytes`);

      return {
        removedFiles,
        removedBackups,
        freedSpace,
        consolidated,
      };

    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`);
      throw error;
    }
  }

  private async loadIndexData(indexPath: string): Promise<any> {
    const indexPathFull = path.join(indexPath, 'index.json');
    const content = await fs.readFile(indexPathFull, 'utf-8');
    return JSON.parse(content);
  }

  private validateIndexStructure(data: any, check: IntegrityCheck): void {
    const requiredFields = ['metadata', 'files'];

    for (const field of requiredFields) {
      if (!data[field]) {
        check.valid = false;
        check.errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate metadata
    if (data.metadata) {
      const metadataFields = ['version', 'created', 'modified', 'totalFiles', 'totalChunks', 'sizeBytes'];
      for (const field of metadataFields) {
        if (!(field in data.metadata)) {
          check.warnings.push(`Missing metadata field: ${field}`);
        }
      }

      // Check for logical inconsistencies
      if (data.metadata.totalFiles < 0) {
        check.valid = false;
        check.errors.push("Invalid totalFiles count in metadata");
      }

      if (data.metadata.totalChunks < 0) {
        check.valid = false;
        check.errors.push("Invalid totalChunks count in metadata");
      }

      if (data.metadata.sizeBytes < 0) {
        check.valid = false;
        check.errors.push("Invalid sizeBytes in metadata");
      }
    }
  }

  private async verifyFiles(data: any, check: IntegrityCheck, options: { checkChecksums: boolean; fastMode: boolean }): Promise<void> {
    const filePaths = Object.keys(data.files || {});

    for (const filePath of filePaths) {
      try {
        await fs.access(filePath);

        // Verify checksum if requested
        if (options.checkChecksums) {
          const expectedChecksum = data.files[filePath]?.hash;
          if (expectedChecksum) {
            const actualChecksum = await this.calculateChecksum(filePath);
            if (actualChecksum !== expectedChecksum) {
              check.valid = false;
              check.errors.push(`Checksum mismatch for file: ${filePath}`);
              check.stats.corruptedFiles.push(filePath);
            }
          }
        }

        check.stats.checksums.set(filePath, await this.calculateChecksum(filePath));

      } catch (error) {
        check.valid = false;
        check.errors.push(`File not found: ${filePath}`);
        check.stats.missingFiles.push(filePath);
      }
    }
  }

  private async checkBackupIntegrity(indexPath: string, check: IntegrityCheck): Promise<void> {
    const backupDir = path.join(indexPath, 'backups');

    try {
      const backups = await fs.readdir(backupDir);
      const backupManifestPath = path.join(backupDir, 'manifest.json');

      let manifest: any = null;
      try {
        const manifestContent = await fs.readFile(backupManifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent);
      } catch {
        // Manifest might not exist, that's okay
      }

      for (const backupFile of backups) {
        if (backupFile === 'manifest.json') continue;

        const backupPath = path.join(backupDir, backupFile);
        try {
          await fs.access(backupPath);

          // Verify backup checksum if in manifest
          if (manifest && manifest.backups) {
            const backupInfo = manifest.backups.find((b: any) => b.path === backupPath);
            if (backupInfo) {
              const currentChecksum = await this.calculateChecksum(backupPath);
              if (currentChecksum !== backupInfo.checksum) {
                check.warnings.push(`Backup checksum mismatch: ${backupFile}`);
              }
            }
          }
        } catch (error) {
          check.warnings.push(`Backup file inaccessible: ${backupFile}`);
        }
      }

    } catch (error) {
      check.warnings.push(`Backup directory not found or inaccessible`);
    }
  }

  private findDuplicates(indexData: any, check: IntegrityCheck): void {
    const fileHashes = new Map<string, string[]>();

    for (const [filePath, fileInfo] of Object.entries(indexData.files || {})) {
      const hash = fileInfo.hash;
      if (!hash) continue;

      if (!fileHashes.has(hash)) {
        fileHashes.set(hash, []);
      }
      fileHashes.get(hash)!.push(filePath);
    }

    for (const [hash, files] of fileHashes) {
      if (files.length > 1) {
        check.stats.duplicates.push(...files);
        check.warnings.push(`Duplicate content found in: ${files.join(', ')}`);
      }
    }
  }

  private validateMetadata(indexData: any, check: IntegrityCheck): void {
    const files = Object.keys(indexData.files || {});
    let calculatedTotalFiles = 0;
    let calculatedTotalChunks = 0;
    let calculatedTotalSize = 0;

    for (const fileInfo of Object.values(indexData.files || {})) {
      calculatedTotalFiles++;
      calculatedTotalChunks += fileInfo.chunks || 0;
      calculatedTotalSize += fileInfo.size || 0;
    }

    if (calculatedTotalFiles !== indexData.metadata.totalFiles) {
      check.errors.push(`Metadata mismatch: expected ${calculatedTotalFiles} files, found ${indexData.metadata.totalFiles}`);
    }

    if (calculatedTotalChunks !== indexData.metadata.totalChunks) {
      check.warnings.push(`Metadata mismatch: expected ${calculatedTotalChunks} chunks, found ${indexData.metadata.totalChunks}`);
    }

    if (Math.abs(calculatedTotalSize - indexData.metadata.sizeBytes) > 1024) { // Allow 1KB difference
      check.warnings.push(`Metadata size mismatch: expected ${calculatedTotalSize}, found ${indexData.metadata.sizeBytes}`);
    }
  }

  private async cacheChecksums(indexPath: string, indexData: any, check: IntegrityCheck): Promise<void> {
    const cachePath = path.join(indexPath, 'checksum-cache.json');
    const cacheData: Record<string, string> = {};

    for (const [filePath, fileInfo] of Object.entries(indexData.files || {})) {
      if (fileInfo.hash) {
        cacheData[filePath] = fileInfo.hash;
      }
    }

    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
  }

  private async updateBackupManifest(indexPath: string, backupInfo?: BackupInfo, clearBackups?: boolean): Promise<void> {
    const backupDir = path.join(indexPath, 'backups');
    const manifestPath = path.join(backupDir, 'manifest.json');

    if (clearBackups) {
      await fs.writeFile(manifestPath, JSON.stringify({ backups: [] }, null, 2));
      return;
    }

    let manifest: any = { backups: [] };
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(content);
    } catch {
      // Manifest doesn't exist, create new one
    }

    if (backupInfo) {
      manifest.backups.push({
        timestamp: backupInfo.timestamp,
        path: backupInfo.path,
        size: backupInfo.size,
        checksum: backupInfo.checksum,
        compression: backupInfo.compression,
      });
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const cacheKey = `${filePath}:${(await fs.stat(filePath)).mtime.getTime()}`;

    if (this.checksumCache.has(cacheKey)) {
      return this.checksumCache.get(cacheKey)!;
    }

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    const checksum = hash.digest('hex').substring(0, 16); // Shortened for performance
    this.checksumCache.set(cacheKey, checksum);

    return checksum;
  }

  private async gzip(data: Buffer): Promise<Buffer> {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private async gunzip(data: Buffer): Promise<Buffer> {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private compareObjects(obj1: any, obj2: any, path: string): string[] {
    const differences: string[] = [];

    const keys1 = new Set(Object.keys(obj1));
    const keys2 = new Set(Object.keys(obj2));

    // Check keys in obj1 not in obj2
    for (const key of keys1) {
      if (!keys2.has(key)) {
        differences.push(`Key missing in obj2: ${path}${key}`);
      }
    }

    // Check keys in obj2 not in obj1
    for (const key of keys2) {
      if (!keys1.has(key)) {
        differences.push(`Key missing in obj1: ${path}${key}`);
      }
    }

    // Compare common keys
    for (const key of keys1) {
      if (!keys2.has(key)) continue;

      const val1 = obj1[key];
      const val2 = obj2[key];

      if (typeof val1 !== typeof val2) {
        differences.push(`Type mismatch at ${path}${key}: ${typeof val1} vs ${typeof val2}`);
      } else if (typeof val1 === 'object' && val1 !== null && val2 !== null) {
        differences.push(...this.compareObjects(val1, val2, `${path}${key}.`));
      } else if (val1 !== val2) {
        differences.push(`Value mismatch at ${path}${key}: ${val1} vs ${val2}`);
      }
    }

    return differences;
  }
}