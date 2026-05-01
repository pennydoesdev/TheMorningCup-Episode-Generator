// Shared types for The Morning Cup generator.

export interface Env {
  // Bindings
  MORNING_CUP_BUCKET: R2Bucket;
  MORNING_CUP_KV?: KVNamespace;

  // Secrets
  OPENAI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  RESEND_API_KEY: string;
  RUN_SECRET: string;

  // Vars
  OPENAI_MODEL?: string;
  ELEVENLABS_MODEL_ID?: string;
  ELEVENLABS_OUTPUT_FORMAT?: string;
  WORKER_TIMEZONE?: string;
  MIN_SCRIPT_WORDS?: string;
  TARGET_SCRIPT_WORDS_MIN?: string;
  TARGET_SCRIPT_WORDS_MAX?: string;
  MAX_SCRIPT_WORDS?: string;
  WORDS_PER_MINUTE?: string;
  MAX_TTS_CHARS_PER_CHUNK?: string;
  ENABLE_EMAIL?: string;
  ENABLE_SOURCE_DIGEST?: string;
  ENABLE_REPAIR_PASS?: string;
  STRIP_PACING_TAGS_FOR_TTS?: string;
  STATUS_PUBLIC?: string;

  EMAIL_FROM?: string;
  EMAIL_TO?: string;
  R2_PUBLIC_BASE_URL?: string;

  PUBLISHER?: string;
  COPYRIGHT_HOLDER?: string;
  PODCAST_GENRE?: string;
  HOST_NAME?: string;

  // Publishing pipeline
  ENABLE_PUBLISHING?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_KEY?: string; // secret: full JSON contents
  WP_URL?: string;
  WP_USERNAME?: string;
  WP_APP_PASSWORD?: string; // secret
  WP_CPT_SLUG?: string;
  WP_PODCAST_SHOW_TAXONOMY?: string;
  WP_PODCAST_SHOW_TERM?: string;

  VOICE_STABILITY?: string;
  VOICE_SIMILARITY_BOOST?: string;
  VOICE_STYLE?: string;
  VOICE_USE_SPEAKER_BOOST?: string;

  // Optional source providers
  NEWS_RSS_FEEDS?: string;
  NEWSAPI_KEY?: string;
  NEWSAPI_ENDPOINT?: string;
}

export interface SocialSectionPost {
  section: string;
  post: string;
}

export interface SocialCopy {
  main_post: string;
  section_posts: SocialSectionPost[];
}

export interface SourceNote {
  category: string;
  title: string;
  source: string;
  url: string;
  date: string;
}

export interface SelfValidation {
  word_count_estimate: number;
  all_sections_present: boolean;
  has_spacers: boolean;
  riddle_answer_at_end: boolean;
  no_music_cues: boolean;
  no_production_notes: boolean;
}

export interface ChapterEntry {
  title: string;
}

export interface EpisodeJson {
  show_title: string;
  episode_date: string;
  source_date: string;
  estimated_runtime: string;
  elevenlabs_script: string;
  riddle_question: string;
  riddle_answer: string;
  social_copy: SocialCopy;
  source_notes: SourceNote[];
  self_validation: SelfValidation;
  chapters: ChapterEntry[];
  source_limited?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  word_count: number;
  estimated_runtime_minutes: number;
  spacer_count: number;
}

export interface ChunkPiece {
  order: number;
  filename: string;
  r2_key: string;
  public_url?: string;
  character_count: number;
  text: string;
  // Indices (0-based) of the spacer-separated sections that BEGIN in this
  // chunk. Most chunks have one entry; merged chunks have several; chunks
  // that are continuations of a long split section have an empty array.
  starts_section_indices: number[];
}

export interface ManifestChunk {
  order: number;
  filename: string;
  r2_key: string;
  public_url?: string;
  character_count: number;
  starts_section_indices: number[];
}

export interface Manifest {
  episode_date: string;
  source_date: string;
  title: string;
  show_name: string;
  publisher: string;
  copyright: string;
  year: number;
  genre: string;
  word_count: number;
  estimated_runtime_minutes: number;
  chunk_count: number;
  chunks: ManifestChunk[];
  chapters: ChapterEntry[];
  generated_at: string;
  validation: {
    ok: boolean;
    errors: string[];
    warnings: string[];
    word_count: number;
    estimated_runtime_minutes: number;
    spacer_count: number;
  };
  source_limited: boolean;
}

export type RunStage =
  | "pending"
  | "generating"
  | "validating"
  | "tts"
  | "completed"
  | "failed";

export interface RunRecord {
  episode_date: string; // YYYY-MM-DD
  source_date: string; // YYYY-MM-DD
  status: RunStage;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  error?: string;
  chunk_count?: number;
  word_count?: number;
  estimated_runtime_minutes?: number;
  manifest_key?: string;
  files_txt_key?: string;
  txt_key?: string;
  html_key?: string;
  json_key?: string;
}

export interface SourceDigest {
  source_date: string; // YYYY-MM-DD
  generated_at: string;
  available: boolean;
  categories: Record<string, SourceItem[]>;
  notes?: string;
}

export interface SourceItem {
  title: string;
  source: string;
  url: string;
  published: string;
  summary?: string;
}
