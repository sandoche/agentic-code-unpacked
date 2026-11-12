/** Runtime contracts shared by collectors, renderers, and browser assets. */
export type { Browser } from 'playwright';
export type Target =
  | { kind: 'pr'; repo: string; number: number; head?: string }
  | { kind: 'branch'; name: string; base?: string }
  | { kind: 'codebase'; name?: string }
  | { kind: 'docs'; name?: string; files?: string[]; text?: string; textFile?: string };

export interface Source {
  head: string;
  base?: string | undefined;
  repo?: string | undefined;
  dirty?: boolean;
  kind?: string;
  title?: string | undefined;
  url?: string | undefined;
  state?: string | undefined;
  baseRef?: string;
}
export interface DiffLine { kind: string; text: string; oldLine: number | null; newLine: number | null }
export interface Hunk { header: string; oldStart: number; newStart: number; lines: DiffLine[] }
export interface CapturedFile {
  id?: string;
  path: string;
  oldPath?: string;
  status?: string;
  hunks?: Hunk[];
  role?: string;
  binary?: boolean;
  omission?: string;
  content?: string;
  baseContent?: string;
  sha256?: string;
  selectedRange?: [number, number];
  additions?: number;
  deletions?: number;
}
export interface ContextFile extends CapturedFile { id: string }
export interface Evidence {
  id: string; fileId: string; startLine: number; endLine: number; side: string; url?: string;
}
export interface Symbol {
  id: string; fileId: string; name: string; kind: string; startLine: number; endLine: number;
  evidenceIds: string[]; side?: string; className?: string; qualifiedName?: string; exportedName?: string;
}
export interface Relationship {
  id: string; fromFileId: string; toFileId: string; label: string; evidenceIds: string[];
  kind?: string; provenance?: string | Record<string, unknown>; fromSymbolId?: string; toSymbolId?: string;
}
export interface Unresolved {
  fileId: string; fromSymbolId?: string; expression?: string; line?: number | undefined;
  reason?: string; evidenceIds?: string[];
}
export interface AnalysisClaim { text: string; evidenceIds: string[]; basis?: string }
export interface TopicReference {
  id: string; title?: string; summary?: string; evidenceIds?: string[];
  reviewFocus?: AnalysisClaim[]; extensionPoints?: AnalysisClaim[];
  before?: string; after?: string; priority?: string; role?: string; comicSuitable?: boolean;
}
export interface Topic extends TopicReference { title: string; summary: string; evidenceIds: string[] }
export interface ValidatedTopic extends Topic { reviewFocus: AnalysisClaim[]; extensionPoints: AnalysisClaim[] }
export interface FlowStep { text: string; evidenceIds: string[]; symbolIds?: string[] }
export interface Flow { id: string; title: string; evidenceIds: string[]; steps: FlowStep[] }
export interface FlowReference { id: string; title?: string; evidenceIds?: string[]; steps?: FlowStep[] }
export interface FileCoverage { fileId: string; role: string; reason: string; topicIds: string[] }
export interface AnalysisReference {
  schemaVersion?: number; title?: string; summary?: string; evidenceIds?: string[];
  topics?: TopicReference[]; flows?: FlowReference[]; fileCoverage?: FileCoverage[]; limitations?: string[];
}
export interface Analysis extends AnalysisReference {
  schemaVersion: 2; title: string; summary: string; evidenceIds: string[];
  topics: ValidatedTopic[]; flows: Flow[]; fileCoverage: FileCoverage[]; limitations: string[];
}
export interface Context {
  schemaVersion: number; target: Target; source: Source; files: ContextFile[];
  evidence: Evidence[]; limitations: string[]; relationships?: Relationship[];
  symbols?: Symbol[]; unresolved?: Unresolved[]; analysis?: AnalysisReference;
  provenance?: Record<string, unknown>;
}
export interface PrMetadata { head: string; base: string; title?: string; url?: string; state?: string }
export interface PrInfo { head: { sha: string }; base: { sha: string }; title: string; html_url: string; state: string }
export interface PrFile { filename: string; previous_filename?: string; status: string; additions: number; deletions: number; patch?: string }
export interface Artifact { path: string; bytes: number; sha256: string }
export interface Delivery { status: string; commentId?: number; url?: string; attachments?: Record<string, string> }
export interface Manifest {
  schemaVersion: number; skill: string; version: string; source: Source; target: Target;
  inputs: { contextHash: string }; artifacts: Artifact[]; status: string; limitations: string[]; delivery: Delivery;
}
export interface ArtifactOptions {
  skill: string; context: Context; outputs: string[]; status?: string; limitations?: string[]; delivery?: Delivery;
}
export interface FinishOptions extends ArtifactOptions { dir: string; summary?: string; markdown?: string }
export interface ShellOptions { title: string; body: string; css?: string; script?: string; data?: unknown; lang?: string }
export interface CommentOptions { skill: string; context: Context; summary?: string; attachments?: string[]; markdown?: string }
export interface ResolvedEvidence extends Evidence { path: string; text: string }

export interface Snippet { evidence: string; label?: string; side?: string; focusLines?: number[] }
export interface WalkthroughStep {
  id: string; title: string; explanation: string; evidence: string[];
  codeEvidence?: string; snippets?: Snippet[]; durationSeconds?: number;
}
export interface OverviewItem { title: string; explanation: string; evidence: string[]; basis?: string }
export interface Overview {
  purpose: string; evidence: string[]; before?: string; after?: string;
  reviewOrder?: OverviewItem[]; extensionPoints?: OverviewItem[];
}
export interface Chapter { id: string; title: string; steps: WalkthroughStep[]; topicIds?: string[]; kind?: string }
export type Walkthrough = { title: string; summary?: string } & (
  | { schemaVersion: 1; steps: WalkthroughStep[] }
  | { schemaVersion: 2; chapters: Chapter[]; overview?: Overview }
);
export interface TimelineStep extends WalkthroughStep {
  chapterId: string; chapterTitle: string; chapterKind: string; topicIds: string[];
  startSeconds: number; endSeconds: number; durationSeconds: number;
}
export interface Diagram { title: string; description: string; mermaid: string }
export interface QuizOption { id: string; text: string; diagram?: Diagram }
export interface Question {
  id: string; topic: string; prompt: string; options: QuizOption[]; correctOptionId: string;
  explanation: string; evidence: string[]; recommendation: string;
  diagram?: Diagram; explanationDiagram?: Diagram;
}
export interface Quiz {
  schemaVersion: number; title: string; questions: Question[]; summary?: string;
  limitations?: string[]; requestedCount?: number; generatedCount?: number; insufficientEvidence?: string;
}
export interface QuizCounts { questions?: number | string | undefined }
export interface Recommendation { topic: string; checks: string[]; evidence: string[]; questionIds: string[]; missed: number }
export interface Grade {
  total: number; correct: number; unanswered: number; incorrect: number; score: number;
  questions: { questionId: string; answerId: string | null; status: string }[]; recommendations: Recommendation[];
}
export interface QuizPayload { quiz: Quiz; evidence: Record<string, ResolvedEvidence> }

export interface Claim { markdown: string; basis: string; evidence: string[] }
export interface DesignDiagram { id: string; title: string; mermaid: string; evidence: string[]; question?: string; flowId?: string }
export interface DesignDocument {
  id: string; title: string; family: string; topicIds?: string[]; flowIds?: string[];
  sections: (Claim & { heading: string })[]; diagrams?: DesignDiagram[];
}
export interface DesignCoverage { family: string; status: string; reason: string; evidence: string[] }
export interface DesignGap { question: string; affectedDocuments: string[]; evidence: string[] }
export type Design = {
  title: string; documents: DesignDocument[]; gaps?: DesignGap[]; coverage?: DesignCoverage[];
} & (
  | { schemaVersion: 1; summary: string; summaryEvidence: string[] }
  | { schemaVersion: 2; overview: { purpose: Claim; reviewFocus: Claim[]; extensionContext: Claim[] } }
);
export interface Annotation { id: string; fileId: string; title: string; text: string; evidenceIds: string[] }
export interface MapContent { schemaVersion: number; title?: string; summary?: string; annotations?: Annotation[]; relationships?: Relationship[] }
export interface Character { id: string; name: string; role: string; evidence: string[] }
export interface Panel { id: string; scene: string; evidence: string[]; caption?: string; dialogue?: { characterId: string; text: string }[] }
export interface Strip { id: string; title: string; limitation: string; topicId?: string; panels: Panel[] }
export interface Storyboard { schemaVersion: number; title: string; concept: string; evidence: string[]; characters: Character[]; strips: Strip[] }
export interface PromptEntry {
  stripId: string; mode: string; prompt: string; promptHash: string; layout?: string;
  artwork: { path: string; sha256: string; provenance: string }[];
}
export interface Prompts { schemaVersion: number; mode: string; requiredCapability: string; preferredTool: string; entries: PromptEntry[] }
export type ArtworkSpecification = string | { strip: string; panels?: unknown };
export type Artwork = string | Record<string, ArtworkSpecification>;
export interface PreparedImage { path: string; sha256: string; extension: string; bytes: Buffer; dataUrl: string }
export interface PreparedArtwork { layout: string; images: PreparedImage[] }
