/** M1 支持的输入形态，与契约 §1.3 保持一致。 */
export type CaptureModality = 'text' | 'voice' | 'image';

/** M1 抽取允许的收支方向；无法确定时为 null。 */
export type CaptureDirection = 'expense' | 'income';

/**
 * M1 识别/抽取产出的单条记账草稿，与 `@gduf/capture-flow` 的 `CaptureDraft` 八字段严格对齐。
 * 身份、幂等键与关联原账单 id 均不由模型产出。
 */
export interface CaptureDraft {
  readonly amount: number | null;
  readonly merchant: string | null;
  readonly occurredAt: string | null;
  readonly direction: CaptureDirection | null;
  readonly confidence: number | null;
  readonly rawText: string;
  readonly modality: CaptureModality;
  readonly sourceRef: string | null;
}

/** 追问补充分片；未提及字段必须保持 undefined，以免覆盖已确认字段。 */
export type CaptureDraftPatch = Partial<
  Pick<CaptureDraft, 'amount' | 'merchant' | 'occurredAt' | 'direction' | 'confidence' | 'rawText'>
>;

/** M2 返回的待追问提示，供二阶段追问抽取理解上下文。 */
export interface PendingFeedbackHint {
  readonly field: string | null;
  readonly code: string;
  readonly severity?: 'blocking' | 'warning';
}

/** M1 识别、校验与上传存储的可恢复失败码。 */
export type CaptureFailureCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_INVALID_OUTPUT'
  | 'EMPTY_INPUT'
  | 'EMPTY_TRANSCRIPT'
  | 'UNREADABLE_RECEIPT'
  | 'INVALID_SOURCE_REF'
  | 'UPLOAD_EMPTY_FILE'
  | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_UNSUPPORTED_TYPE';

/** 面向调用方的结构化失败结果。 */
export interface CaptureFailure {
  readonly code: CaptureFailureCode;
  readonly message: string;
  readonly field?: string;
}

/** 首轮文本/图片/语音草稿抽取返回结果。 */
export type DraftExtractionOutcome =
  | { readonly ok: true; readonly drafts: CaptureDraft[]; readonly promptVersion: string }
  | { readonly ok: false; readonly failure: CaptureFailure };

/** 追问补充抽取返回结果。 */
export type PatchExtractionOutcome =
  | { readonly ok: true; readonly patch: CaptureDraftPatch; readonly promptVersion: string }
  | { readonly ok: false; readonly failure: CaptureFailure };

/** 受控上传存储落盘结果。 */
export interface SavedCaptureUpload {
  readonly sourceRef: string;
  readonly modality: 'image' | 'voice';
  readonly mimeType: string;
  readonly byteLength: number;
}

/** 上传文件落盘结果。 */
export type UploadSaveOutcome =
  | { readonly ok: true; readonly upload: SavedCaptureUpload }
  | { readonly ok: false; readonly failure: CaptureFailure };

/** 文本 JSON 对话补全入参。 */
export interface TextCompletionInput {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

/** 图片多模态 JSON 补全入参。 */
export interface VisionCompletionInput {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly imageBytes: Uint8Array;
  readonly mimeType: string;
}

/** 语音转写入参。 */
export interface AudioTranscriptionInput {
  readonly audioBytes: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
}

/** 外部 AI 服务适配接口，测试可通过依赖注入替换为 stub。 */
export interface CaptureAiProvider {
  completeJson: (input: TextCompletionInput) => Promise<string>;
  completeVisionJson: (input: VisionCompletionInput) => Promise<string>;
  transcribeAudio: (input: AudioTranscriptionInput) => Promise<string>;
}

/** 外部 AI 适配层抛出的结构化异常错误码。 */
export type CaptureProviderErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_INVALID_OUTPUT';

/** 外部 AI 适配层抛出的结构化错误。 */
export class CaptureProviderError extends Error {
  readonly code: CaptureProviderErrorCode;
  readonly statusCode?: number;

  constructor(code: CaptureProviderErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = 'CaptureProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
