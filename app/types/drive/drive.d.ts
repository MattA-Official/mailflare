// Ported from legacy/src/app/(drive)/drive-cache.ts, drive-events.ts, drive-upload-types.d.ts and
// legacy/src/app/d/[token]/types.d.ts.
import type { DriveCrumb, DriveItemDto, DriveRole } from '#lib/drive/types'

export type DriveListing = { items: DriveItemDto[], path: DriveCrumb[], role: DriveRole, storageUsed: number, storageLimit: number | null }
export type DriveStorageDetail = { used: number, limit: number | null }
export type DriveFolderNode = { id: string, name: string, parentId: string | null }

export type DriveUploadStatus = 'queued' | 'uploading' | 'done' | 'failed'
export type DriveUploadEntry = { id: string, name: string, percent: number, resumed: boolean, status: DriveUploadStatus, error?: string }

export type PublicDriveItem = { id: string, kind: 'file' | 'folder', name: string, size: number, contentType: string, updatedAt: string }
export type PublicDriveListing = { item: PublicDriveItem, items: PublicDriveItem[], path: { id: string, name: string }[] }
