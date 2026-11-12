// Generated from packages/core/src/scripts/decode.mts. Edit that source, then run pnpm skills:build.
import { isRecord } from './values.mjs';
const string = (value) => typeof value === 'string';
const numeric = (value) => typeof value === 'number';
const boolean = (value) => typeof value === 'boolean';
const unknown = (_value) => true;
function optional(guard) {
    return (value) => value === undefined || guard(value);
}
function array(guard) {
    return (value) => {
        if (!Array.isArray(value))
            return false;
        const items = value;
        return items.every(guard);
    };
}
function object(shape) {
    return (value) => {
        if (!isRecord(value))
            return false;
        for (const key in shape)
            if (!shape[key](value[key]))
                return false;
        return true;
    };
}
function read(value, guard, label) {
    if (!guard(value))
        throw Error(`Invalid ${label}: malformed fields or unsupported schemaVersion`);
    return value;
}
const strings = array(string);
const record = isRecord;
const target = (value) => {
    if (!isRecord(value))
        return false;
    if (value.kind === 'pr')
        return string(value.repo) && numeric(value.number) && optional(string)(value.head);
    if (value.kind === 'branch')
        return string(value.name) && optional(string)(value.base);
    if (value.kind === 'codebase')
        return optional(string)(value.name);
    return value.kind === 'docs' && optional(string)(value.name) && optional(strings)(value.files) && optional(string)(value.text) && optional(string)(value.textFile);
};
const source = object({ head: string, base: optional(string), repo: optional(string), dirty: optional(boolean), kind: optional(string), title: optional(string), url: optional(string), state: optional(string), baseRef: optional(string) });
const nullableNumber = (value) => value === null || numeric(value);
const line = object({ kind: string, text: string, oldLine: nullableNumber, newLine: nullableNumber });
const hunk = object({ header: string, oldStart: numeric, newStart: numeric, lines: array(line) });
const range = (value) => Array.isArray(value) && value.length === 2 && numeric(value[0]) && numeric(value[1]);
const file = object({ id: string, path: string, oldPath: optional(string), status: optional(string), hunks: optional(array(hunk)), role: optional(string), binary: optional(boolean), omission: optional(string), content: optional(string), baseContent: optional(string), sha256: optional(string), selectedRange: optional(range), additions: optional(numeric), deletions: optional(numeric) });
const evidence = object({ id: string, fileId: string, startLine: numeric, endLine: numeric, side: string, url: optional(string) });
const symbol = object({ id: string, fileId: string, name: string, kind: string, startLine: numeric, endLine: numeric, evidenceIds: strings, side: optional(string), className: optional(string), qualifiedName: optional(string), exportedName: optional(string) });
const provenance = (value) => string(value) || record(value);
const relationship = object({ id: string, fromFileId: string, toFileId: string, label: string, evidenceIds: strings, kind: optional(string), provenance: optional(provenance), fromSymbolId: optional(string), toSymbolId: optional(string) });
const unresolved = object({ fileId: string, fromSymbolId: optional(string), expression: optional(string), line: optional(numeric), reason: optional(string), evidenceIds: optional(strings) });
const analysisClaim = object({ text: string, evidenceIds: strings, basis: optional(string) });
const topic = object({ id: string, title: string, summary: string, evidenceIds: strings, reviewFocus: array(analysisClaim), extensionPoints: array(analysisClaim), before: optional(string), after: optional(string), priority: optional(string), role: optional(string), comicSuitable: optional(boolean) });
const topicReference = object({ id: string, title: optional(string), summary: optional(string), evidenceIds: optional(strings), reviewFocus: optional(array(analysisClaim)), extensionPoints: optional(array(analysisClaim)), before: optional(string), after: optional(string), priority: optional(string), role: optional(string), comicSuitable: optional(boolean) });
const flowStep = object({ text: string, evidenceIds: strings, symbolIds: optional(strings) });
const flow = object({ id: string, title: string, evidenceIds: strings, steps: array(flowStep) });
const coverage = object({ fileId: string, role: string, reason: string, topicIds: strings });
const version2 = (value) => value === 2;
const analysis = object({ schemaVersion: version2, title: string, summary: string, evidenceIds: strings, topics: array(topic), flows: array(flow), fileCoverage: array(coverage), limitations: strings });
const flowReference = object({ id: string, title: optional(string), evidenceIds: optional(strings), steps: optional(array(flowStep)) });
const analysisReference = object({ schemaVersion: optional(numeric), title: optional(string), summary: optional(string), evidenceIds: optional(strings), topics: optional(array(topicReference)), flows: optional(array(flowReference)), fileCoverage: optional(array(coverage)), limitations: optional(strings) });
const context = object({ schemaVersion: numeric, target, source, files: array(file), evidence: array(evidence), limitations: strings, relationships: optional(array(relationship)), symbols: optional(array(symbol)), unresolved: optional(array(unresolved)), analysis: optional(analysisReference), provenance: optional(record) });
function checkRelationships(value) {
    if (!isRecord(value) || !Array.isArray(value.relationships))
        return;
    const entries = value.relationships;
    for (const entry of entries)
        if (isRecord(entry)) {
            if (entry.kind !== undefined && typeof entry.kind !== 'string')
                throw Error('Relationship kind must be text');
            if (entry.provenance !== undefined && typeof entry.provenance !== 'string' && !isRecord(entry.provenance))
                throw Error('Relationship provenance must be text or an object');
        }
}
export function decodeContext(value) {
    checkRelationships(value);
    if (isRecord(value) && Array.isArray(value.evidence)) {
        const entries = value.evidence;
        for (const entry of entries)
            if (isRecord(entry)) {
                const start = entry.startLine, end = entry.endLine;
                if (typeof start !== 'number' || !Number.isInteger(start) || start < 1 || typeof end !== 'number' || !Number.isInteger(end) || end < start)
                    throw Error('Invalid evidence range');
            }
    }
    return read(value, context, 'context, evidence, symbol, or relationship');
}
export function decodeAnalysis(value) { return read(value, analysis, 'analysis topics, flows, file coverage or limitations'); }
export function decodeTarget(value) { return read(value, target, 'target'); }
export function decodePrMetadata(value) {
    return read(value, object({ head: string, base: string, title: optional(string), url: optional(string), state: optional(string) }), 'pinned PR metadata');
}
export function decodePrInfo(value) {
    const revision = object({ sha: string });
    return read(value, object({ head: revision, base: revision, title: string, html_url: string, state: string }), 'PR metadata');
}
export function decodePrFiles(value) {
    return read(value, array(object({ filename: string, previous_filename: optional(string), status: string, additions: numeric, deletions: numeric, patch: optional(string) })), 'PR file list');
}
export function decodeManifest(value) {
    const artifact = object({ path: string, bytes: numeric, sha256: string });
    const attachments = (input) => isRecord(input) && Object.values(input).every(string);
    const delivery = object({ status: string, commentId: optional(numeric), url: optional(string), attachments: optional(attachments) });
    return read(value, object({ schemaVersion: numeric, skill: string, version: string, source, target, inputs: object({ contextHash: string }), artifacts: array(artifact), status: string, limitations: strings, delivery }), 'manifest');
}
const snippet = object({ evidence: string, label: optional(string), side: optional(string), focusLines: optional(array(numeric)) });
const step = object({ id: string, title: string, explanation: string, evidence: strings, codeEvidence: optional(string), snippets: optional(array(snippet)), durationSeconds: optional(numeric) });
const overviewItem = object({ title: string, explanation: string, evidence: strings, basis: optional(string) });
const overview = object({ purpose: string, evidence: strings, before: optional(string), after: optional(string), reviewOrder: optional(array(overviewItem)), extensionPoints: optional(array(overviewItem)) });
const chapter = object({ id: string, title: string, steps: array(step), topicIds: optional(strings), kind: optional(string) });
const walkthrough = (value) => {
    if (!isRecord(value) || !string(value.title) || !optional(string)(value.summary))
        return false;
    return value.schemaVersion === 1 ? array(step)(value.steps) : value.schemaVersion === 2 && array(chapter)(value.chapters) && optional(overview)(value.overview);
};
export function decodeWalkthrough(value) { return read(value, walkthrough, 'walkthrough schemaVersion, chapters, snippets, or steps'); }
const diagram = object({ title: string, description: string, mermaid: string });
const option = object({ id: string, text: string, diagram: optional(diagram) });
const question = object({ id: string, topic: string, prompt: string, options: array(option), correctOptionId: string, explanation: string, evidence: strings, recommendation: string, diagram: optional(diagram), explanationDiagram: optional(diagram) });
const quiz = object({ schemaVersion: numeric, title: string, questions: array(question), summary: optional(string), limitations: optional(strings), requestedCount: optional(numeric), generatedCount: optional(numeric), insufficientEvidence: optional(string) });
export function decodeQuiz(value) {
    if (isRecord(value)) {
        const requested = value.requestedCount;
        if (requested !== undefined && (typeof requested !== 'number' || !Number.isSafeInteger(requested) || requested < 1))
            throw Error('requestedCount must be a positive integer');
        if (value.generatedCount !== undefined && typeof value.generatedCount !== 'number')
            throw Error('generatedCount must match the actual question count');
        if (Array.isArray(value.questions)) {
            const questions = value.questions;
            for (const question of questions)
                if (isRecord(question)) {
                    const diagrams = [question.diagram, question.explanationDiagram];
                    if (Array.isArray(question.options)) {
                        const options = question.options;
                        for (const option of options)
                            if (isRecord(option))
                                diagrams.push(option.diagram);
                    }
                    for (const item of diagrams)
                        if (item !== undefined) {
                            if (value.schemaVersion !== 3)
                                throw Error('Diagram requires schemaVersion 3');
                            if (!diagram(item))
                                throw Error('Invalid diagram: title, description, and mermaid are required');
                        }
                }
        }
    }
    return read(value, quiz, 'quiz schemaVersion, question, option, diagram, or explanation');
}
const claim = object({ markdown: string, basis: string, evidence: strings });
const section = object({ heading: string, markdown: string, basis: string, evidence: strings });
const designDiagram = object({ id: string, title: string, mermaid: string, evidence: strings, question: optional(string), flowId: optional(string) });
const document = object({ id: string, title: string, family: string, topicIds: optional(strings), flowIds: optional(strings), sections: array(section), diagrams: optional(array(designDiagram)) });
const designCoverage = object({ family: string, status: string, reason: string, evidence: strings });
const designGap = object({ question: string, affectedDocuments: strings, evidence: strings });
const design = (value) => {
    if (!isRecord(value) || !string(value.title) || !array(document)(value.documents) || !optional(array(designGap))(value.gaps) || !optional(array(designCoverage))(value.coverage))
        return false;
    return value.schemaVersion === 1 ? string(value.summary) && strings(value.summaryEvidence) : value.schemaVersion === 2 && object({ purpose: claim, reviewFocus: array(claim), extensionContext: array(claim) })(value.overview);
};
export function decodeDesign(value) { return read(value, design, 'design schemaVersion, overview claim, document, or coverage'); }
const annotation = object({ id: string, fileId: string, title: string, text: string, evidenceIds: strings });
const mapContent = object({ schemaVersion: numeric, title: optional(string), summary: optional(string), annotations: optional(array(annotation)), relationships: optional(array(relationship)) });
export function decodeMapContent(value) { checkRelationships(value); return read(value, mapContent, 'map content annotations or relationships'); }
const character = object({ id: string, name: string, role: string, evidence: strings });
const dialogue = object({ characterId: string, text: string });
const panel = object({ id: string, scene: string, evidence: strings, caption: optional(string), dialogue: optional(array(dialogue)) });
const strip = object({ id: string, title: string, limitation: string, topicId: optional(string), panels: array(panel) });
const storyboard = object({ schemaVersion: numeric, title: string, concept: string, evidence: strings, characters: array(character), strips: array(strip) });
export function decodeStoryboard(value) { return read(value, storyboard, 'storyboard schemaVersion, characters, strips, panels, caption, or dialogue'); }
const savedArtwork = object({ path: string, sha256: string, provenance: string });
const promptEntry = object({ stripId: string, mode: string, prompt: string, promptHash: string, layout: optional(string), artwork: array(savedArtwork) });
export function decodePrompts(value) { return read(value, object({ schemaVersion: numeric, mode: string, requiredCapability: string, preferredTool: string, entries: array(promptEntry) }), 'saved artwork prompts'); }
export function decodeArtwork(value) {
    const specification = (entry) => string(entry) || object({ strip: string, panels: optional(unknown) })(entry);
    const artwork = (entry) => string(entry) || isRecord(entry) && Object.values(entry).every(specification);
    return read(value, artwork, 'artwork strip mapping');
}
