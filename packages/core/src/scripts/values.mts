/** Narrow data at JSON, process, and optional-dependency boundaries. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function record(value: unknown, label = 'value'): Record<string, unknown> {
  if (!isRecord(value)) throw Error(`Invalid ${label}: expected an object`);
  return value;
}
export function text(value: unknown, label = 'value'): string {
  if (typeof value !== 'string') throw Error(`Invalid ${label}: expected text`);
  return value;
}
export function list(value: unknown, label = 'value'): unknown[] {
  if (!Array.isArray(value)) throw Error(`Invalid ${label}: expected an array`);
  const result: unknown[] = value;
  return result;
}
export function strings(value: unknown, label = 'value'): string[] {
  return list(value, label).map(item => text(item, label));
}
export function number(value: unknown, label = 'value'): number {
  if (typeof value !== 'number') throw Error(`Invalid ${label}: expected a number`);
  return value;
}
export function present<T>(value: T | undefined | null, label = 'value'): T {
  if (value === undefined || value === null) throw Error(`Missing ${label}`);
  return value;
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
export function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, text(entry)]));
}
