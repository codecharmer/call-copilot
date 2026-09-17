/**
 * Shared contracts for Codebase Call Copilot.
 *
 * These are the design contracts from docs/DESIGN.md §9, expressed as TypeScript
 * types. This package contains no runtime code. Implementations live in
 * @call-copilot/providers, @call-copilot/indexer, @call-copilot/retrieval and
 * apps/desktop, and every process boundary (renderer, main, index worker)
 * speaks this vocabulary.
 */

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

/** Every event crossing a process or adapter boundary is wrapped in this. */
export type EventEnvelope<T> = {
  eventId: string;
  sessionId: string;
  requestId?: string;
  questionRevision?: number;
  repositoryId?: string;
  indexGeneration?: string;
  timestampMs: number;
  type: EventType;
  payload: T;
};

/**
 * Required event types. Terminal answer states are distinct on purpose so that
 * "finished", "canceled" and "failed after partial output" can never be confused.
 */
export type EventType =
  | 'capture.status'
  | 'transcript.partial'
  | 'transcript.final'
  | 'question.accepted'
  | 'index.progress'
  | 'index.ready'
  | 'answer.sources'
  | 'answer.delta'
  | 'answer.completed'
  | 'answer.canceled'
  | 'operation.failed';

// ---------------------------------------------------------------------------
// State machines (kept separate so typed questions work without audio)
// ---------------------------------------------------------------------------

export type SessionState =
  | 'idle'
  | 'checking'
  | 'listening'
  | 'paused'
  | 'reconnecting'
  | 'stopped';

export type IndexState = 'unindexed' | 'indexing' | 'ready' | 'refreshing' | 'degraded' | 'failed';

export type AnswerState =
  | 'pending'
  | 'retrieving'
  | 'streaming'
  | 'completed'
  | 'canceled'
  | 'superseded'
  | 'failed';

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

/** "me" is the user's microphone; "call" is remote participants. Never individual speakers. */
export type AudioSourceKind = 'me' | 'call';

export type AudioFrame = {
  source: AudioSourceKind;
  /** Monotonic capture timestamp, not wall-clock. */
  timestampMs: number;
  sampleRateHz: number;
  channels: number;
  pcm: ArrayBuffer;
};

export type SourceHealth = 'ok' | 'silent' | 'permission-denied' | 'disconnected' | 'dead-stream';

export type TranscriptSegment = {
  source: AudioSourceKind;
  /** Increments on every reconnect; sequence numbers restart per epoch. */
  streamEpoch: number;
  sequence: number;
  text: string;
  startMs: number;
  endMs: number;
  /** True once the provider will no longer revise this text. */
  isFinal: boolean;
  /** True when the provider also detected an utterance boundary (pause). */
  isTurnEnd: boolean;
  revision: number;
};

export type GitSnapshot = {
  branch?: string;
  headCommit?: string;
  dirty: boolean;
};

export type IndexGeneration = {
  id: string;
  repositoryId: string;
  git?: GitSnapshot;
  createdAtMs: number;
  parserVersion: string;
  embeddingModel: {
    id: string;
    checksum: string;
    dimensions: number;
    preprocessingVersion: string;
  };
};

export type Chunk = {
  id: string;
  repositoryId: string;
  generationId: string;
  relativePath: string;
  fileHash: string;
  /** 1-based, inclusive, already corrected for CRLF and Unicode offsets. */
  startLine: number;
  endLine: number;
  language: string;
  symbols: string[];
  text: string;
};

/** An excerpt selected for one request. The model cites `sourceId`, never a path it invents. */
export type EvidenceItem = {
  sourceId: string;
  chunk: Chunk;
};

export type EvidencePack = {
  requestId: string;
  repositoryId: string;
  generationId: string;
  items: EvidenceItem[];
  tokenBudget: number;
  tokensUsed: number;
};

export type AcceptedQuestion = {
  requestId: string;
  revision: number;
  /** Verbatim transcript wording, kept so transcription corrections stay visible. */
  originalText: string;
  /** Standalone retrieval query after follow-up resolution. */
  query: string;
  source: AudioSourceKind | 'manual';
  subquestions?: string[];
};

export type AnswerUsage = {
  inputTokens?: number;
  outputTokens?: number;
  provider: string;
  model: string;
};

// ---------------------------------------------------------------------------
// Adapter interfaces (DESIGN.md §9 table)
// ---------------------------------------------------------------------------

/** Minimal typed emitter; implementations may wrap Node's EventEmitter. */
export type Unsubscribe = () => void;
export type Listener<T> = (event: EventEnvelope<T>) => void;

export interface AudioSourceAdapter {
  listSources(): Promise<Array<{ id: string; label: string; kind: AudioSourceKind }>>;
  /** Emits timestamped frames and source-health events. */
  start(sourceIds: string[]): Promise<void>;
  pause(): Promise<void>;
  /** Must stop enqueueing immediately and release capture within ~1 s. */
  stop(): Promise<void>;
  onFrame(listener: (frame: AudioFrame) => void): Unsubscribe;
  onHealth(listener: Listener<{ source: AudioSourceKind; health: SourceHealth }>): Unsubscribe;
}

export interface TranscriptionProvider {
  connect(): Promise<void>;
  sendAudio(frame: AudioFrame): void;
  close(): Promise<void>;
  /** Emits revisions, final segments, turn boundaries, and errors. */
  onSegment(listener: (segment: TranscriptSegment) => void): Unsubscribe;
  onConnectionState(
    listener: Listener<{ state: 'connected' | 'reconnecting' | 'closed'; epoch: number }>,
  ): Unsubscribe;
  onError(listener: Listener<{ code: string; message: string; retryable: boolean }>): Unsubscribe;
}

export interface RepositoryIndexer {
  register(rootPath: string, displayName?: string): Promise<{ repositoryId: string }>;
  /** Emits progress and atomically publishes a generation on completion. */
  index(repositoryId: string): Promise<IndexGeneration>;
  refresh(repositoryId: string): Promise<IndexGeneration>;
  remove(repositoryId: string): Promise<void>;
  onProgress(
    listener: Listener<{
      filesSeen: number;
      filesIndexed: number;
      excluded: Array<{ path: string; reason: string }>;
    }>,
  ): Unsubscribe;
}

export interface QuestionDetector {
  observeTurn(segment: TranscriptSegment): void;
  /** Manual ask always works, on selected text or a typed question. */
  askManually(text: string): AcceptedQuestion;
  reset(): void;
  /** Emits accepted questions with original text, query, and revision. */
  onQuestion(listener: (question: AcceptedQuestion) => void): Unsubscribe;
}

export interface CodeRetriever {
  /** Returns only evidence from the requested repository and generation. */
  search(
    query: AcceptedQuestion,
    scope: { repositoryId: string; generationId: string },
  ): Promise<Chunk[]>;
  expand(seed: Chunk[], scope: { repositoryId: string; generationId: string }): Promise<Chunk[]>;
  readEvidence(chunkIds: string[]): Promise<EvidencePack>;
}

export interface AnswerProvider {
  /** Streams text deltas, source IDs, a terminal status, and available usage data. */
  streamAnswer(input: {
    question: AcceptedQuestion;
    evidence: EvidencePack;
    conversationWindow: TranscriptSegment[];
  }): AsyncIterable<
    | { type: 'answer.sources'; sourceIds: string[] }
    | { type: 'answer.delta'; text: string }
    | { type: 'answer.completed'; usage?: AnswerUsage }
    | { type: 'answer.canceled' }
    | { type: 'operation.failed'; code: string; message: string; partial: boolean }
  >;
  cancel(requestId: string): void;
}
