// Generated from packages/core/src/scripts/values.mts. Edit that source, then run pnpm skills:build.
/** Narrow data at JSON, process, and optional-dependency boundaries. */
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function record(value, label = 'value') {
    if (!isRecord(value))
        throw Error(`Invalid ${label}: expected an object`);
    return value;
}
export function text(value, label = 'value') {
    if (typeof value !== 'string')
        throw Error(`Invalid ${label}: expected text`);
    return value;
}
export function list(value, label = 'value') {
    if (!Array.isArray(value))
        throw Error(`Invalid ${label}: expected an array`);
    const result = value;
    return result;
}
export function strings(value, label = 'value') {
    return list(value, label).map(item => text(item, label));
}
export function number(value, label = 'value') {
    if (typeof value !== 'number')
        throw Error(`Invalid ${label}: expected a number`);
    return value;
}
export function present(value, label = 'value') {
    if (value === undefined || value === null)
        throw Error(`Missing ${label}`);
    return value;
}
export function message(error) {
    return error instanceof Error ? error.message : String(error);
}
export function hasCode(error, code) {
    return isRecord(error) && error.code === code;
}
export function stringMap(value) {
    const source = record(value);
    return Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, text(entry)]));
}
