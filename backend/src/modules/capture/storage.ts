import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { toShanghaiDate } from '../../shared/time.ts';
import { isControlledSourceRef } from './schema.ts';
import type { CaptureFailure, UploadSaveOutcome } from './types.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

interface MediaSpec {
  readonly modality: 'image' | 'voice';
  readonly canonicalMime: string;
  readonly ext: string;
  readonly maxBytes: number;
}

const MIME_SPECS: Readonly<Record<string, MediaSpec>> = {
  'image/jpeg': { modality: 'image', canonicalMime: 'image/jpeg', ext: 'jpg', maxBytes: MAX_IMAGE_BYTES },
  'image/jpg': { modality: 'image', canonicalMime: 'image/jpeg', ext: 'jpg', maxBytes: MAX_IMAGE_BYTES },
  'image/png': { modality: 'image', canonicalMime: 'image/png', ext: 'png', maxBytes: MAX_IMAGE_BYTES },
  'image/webp': { modality: 'image', canonicalMime: 'image/webp', ext: 'webp', maxBytes: MAX_IMAGE_BYTES },
  'audio/webm': { modality: 'voice', canonicalMime: 'audio/webm', ext: 'webm', maxBytes: MAX_AUDIO_BYTES },
  'audio/wav': { modality: 'voice', canonicalMime: 'audio/wav', ext: 'wav', maxBytes: MAX_AUDIO_BYTES },
  'audio/x-wav': { modality: 'voice', canonicalMime: 'audio/wav', ext: 'wav', maxBytes: MAX_AUDIO_BYTES },
  'audio/mpeg': { modality: 'voice', canonicalMime: 'audio/mpeg', ext: 'mp3', maxBytes: MAX_AUDIO_BYTES },
  'audio/mp3': { modality: 'voice', canonicalMime: 'audio/mpeg', ext: 'mp3', maxBytes: MAX_AUDIO_BYTES },
  'audio/mp4': { modality: 'voice', canonicalMime: 'audio/mp4', ext: 'm4a', maxBytes: MAX_AUDIO_BYTES },
  'audio/m4a': { modality: 'voice', canonicalMime: 'audio/mp4', ext: 'm4a', maxBytes: MAX_AUDIO_BYTES },
  'audio/x-m4a': { modality: 'voice', canonicalMime: 'audio/mp4', ext: 'm4a', maxBytes: MAX_AUDIO_BYTES },
  'audio/ogg': { modality: 'voice', canonicalMime: 'audio/ogg', ext: 'ogg', maxBytes: MAX_AUDIO_BYTES }
};

const EXT_TO_MEDIA: Readonly<Record<string, { readonly modality: 'image' | 'voice'; readonly mimeType: string }>> = {
  '.jpg': { modality: 'image', mimeType: 'image/jpeg' },
  '.png': { modality: 'image', mimeType: 'image/png' },
  '.webp': { modality: 'image', mimeType: 'image/webp' },
  '.webm': { modality: 'voice', mimeType: 'audio/webm' },
  '.wav': { modality: 'voice', mimeType: 'audio/wav' },
  '.mp3': { modality: 'voice', mimeType: 'audio/mpeg' },
  '.m4a': { modality: 'voice', mimeType: 'audio/mp4' },
  '.ogg': { modality: 'voice', mimeType: 'audio/ogg' }
};

function hasValidImageSignature(bytes: Uint8Array, canonicalMime: string): boolean {
  if (canonicalMime === 'image/jpeg') {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (canonicalMime === 'image/png') {
    return (
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (canonicalMime === 'image/webp') {
    if (bytes.byteLength < 12) {
      return false;
    }
    const header = Buffer.from(bytes.subarray(0, 4)).toString('ascii');
    const format = Buffer.from(bytes.subarray(8, 12)).toString('ascii');
    return header === 'RIFF' && format === 'WEBP';
  }
  return true;
}

/** 受控上传存储入参。 */
export interface SaveCaptureUploadInput {
  readonly uploadDir: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly now?: Date;
}

/**
 * 校验并持久化上传的语音或图片文件到受控目录，返回相对路径 `sourceRef`。
 * 不返回宿主机绝对路径，也不接收内联 base64 字符串。
 */
export async function saveCaptureUpload(input: SaveCaptureUploadInput): Promise<UploadSaveOutcome> {
  if (input.bytes.byteLength === 0) {
    return {
      ok: false,
      failure: { code: 'UPLOAD_EMPTY_FILE', message: '上传文件不能为空。', field: 'file' }
    };
  }

  const normalizedMime = input.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const spec = MIME_SPECS[normalizedMime];
  if (spec === undefined) {
    return {
      ok: false,
      failure: {
        code: 'UPLOAD_UNSUPPORTED_TYPE',
        message: `不支持的文件类型: ${input.mimeType}`,
        field: 'file'
      }
    };
  }

  if (input.bytes.byteLength > spec.maxBytes) {
    return {
      ok: false,
      failure: {
        code: 'UPLOAD_TOO_LARGE',
        message: `上传文件超过限制（上限 ${Math.round(spec.maxBytes / (1024 * 1024))} MB）。`,
        field: 'file'
      }
    };
  }

  if (spec.modality === 'image' && !hasValidImageSignature(input.bytes, spec.canonicalMime)) {
    return {
      ok: false,
      failure: {
        code: 'UPLOAD_UNSUPPORTED_TYPE',
        message: '图片文件内容与声明的格式不匹配。',
        field: 'file'
      }
    };
  }

  const shanghaiDate = toShanghaiDate((input.now ?? new Date()).toISOString());
  const year = shanghaiDate.slice(0, 4);
  const month = shanghaiDate.slice(5, 7);
  const fileName = `${randomUUID()}.${spec.ext}`;
  const targetDir = resolve(input.uploadDir, year, month);
  const targetPath = resolve(targetDir, fileName);

  await mkdir(targetDir, { recursive: true });
  await writeFile(targetPath, input.bytes);

  return {
    ok: true,
    upload: {
      sourceRef: `uploads/${year}/${month}/${fileName}`,
      modality: spec.modality,
      mimeType: spec.canonicalMime,
      byteLength: input.bytes.byteLength
    }
  };
}

/** 读取受控上传文件结果。 */
export type ReadCaptureUploadOutcome =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly mimeType: string;
      readonly modality: 'image' | 'voice';
      readonly filename: string;
    }
  | { readonly ok: false; readonly failure: CaptureFailure };

/**
 * 根据受控 `sourceRef` 从 `uploadDir` 安全读取文件，防止路径穿越和符号链接逃逸。
 */
export async function readCaptureUpload(
  uploadDir: string,
  sourceRef: string
): Promise<ReadCaptureUploadOutcome> {
  if (!isControlledSourceRef(sourceRef)) {
    return {
      ok: false,
      failure: {
        code: 'INVALID_SOURCE_REF',
        message: '源文件引用不合法，必须来自受控上传目录。',
        field: 'sourceRef'
      }
    };
  }

  const subPath = sourceRef.slice('uploads/'.length);
  const rootDir = resolve(uploadDir);
  const targetPath = resolve(rootDir, subPath);
  const rel = relative(rootDir, targetPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return {
      ok: false,
      failure: {
        code: 'INVALID_SOURCE_REF',
        message: '源文件引用越界。',
        field: 'sourceRef'
      }
    };
  }

  try {
    const stat = await lstat(targetPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return {
        ok: false,
        failure: {
          code: 'INVALID_SOURCE_REF',
          message: '源文件不是受控常规文件。',
          field: 'sourceRef'
        }
      };
    }
    const bytes = await readFile(targetPath);
    const ext = extname(targetPath).toLowerCase();
    const media = EXT_TO_MEDIA[ext];
    if (media === undefined) {
      return {
        ok: false,
        failure: {
          code: 'INVALID_SOURCE_REF',
          message: '源文件扩展名不受支持。',
          field: 'sourceRef'
        }
      };
    }
    return {
      ok: true,
      bytes,
      mimeType: media.mimeType,
      modality: media.modality,
      filename: subPath.split('/').pop() ?? `upload${ext}`
    };
  } catch {
    return {
      ok: false,
      failure: {
        code: 'INVALID_SOURCE_REF',
        message: '找不到对应的上传文件，请重新上传。',
        field: 'sourceRef'
      }
    };
  }
}
