// Generated from packages/core/src/scripts/structure.mts. Edit that source, then run pnpm skills:build.
import path from 'node:path';
import { parseAdditionalFiles } from './structure-syntax.mjs';
const nameOf = (declaration) => [
    declaration.namespace, declaration.container, declaration.name,
].filter(Boolean).join('.');
const sourceRelative = (directory, spec) => {
    if (!spec || /^(?:\/|[a-z]:)|\\/iu.test(spec))
        return undefined;
    const key = path.posix.join(directory, spec);
    return key === '..' || key.startsWith('../') ? undefined : key;
};
const shortName = (name) => name.split('.').at(-1) ?? name;
const sqlName = (name) => name.replace(/"([^"]|"")*"|[\p{L}_][\p{L}\p{N}_$]*/gu, part => (part.startsWith('"') ? part.slice(1, -1).replaceAll('""', '"') : part.toLowerCase()));
const normalize = (unit, name) => {
    if (unit.language === 'sql')
        return sqlName(name);
    if (unit.language === 'powershell')
        return name.toLowerCase();
    return name;
};
const unique = (items) => {
    const candidates = new Set(items);
    return candidates.size === 1 ? candidates.values().next().value : undefined;
};
function physicalPaths(unit, item) {
    const directory = path.posix.dirname(unit.file.path);
    switch (item.kind) {
        case 'path':
            return [sourceRelative(directory, item.spec)];
        case 'lua': {
            const spec = item.spec.replaceAll('.', '/');
            return [sourceRelative('.', spec + '.lua'), sourceRelative('.', spec + '/init.lua')];
        }
        case 'module': {
            const filename = path.posix.basename(unit.file.path, '.rs');
            const parent = ['main', 'lib', 'mod'].includes(filename) ? directory : path.posix.join(directory, filename);
            return [sourceRelative(parent, item.spec + '.rs'), sourceRelative(parent, item.spec + '/mod.rs')];
        }
        case 'python': {
            const relative = /^(\.+)(.*)$/u.exec(item.spec);
            if (!relative?.[1])
                return [];
            const parent = path.posix.join(directory, '../'.repeat(relative[1].length - 1));
            const modulePath = (relative[2] || item.member || '').replaceAll('.', '/');
            return [sourceRelative(parent, modulePath + '.py'), sourceRelative(parent, modulePath + '/__init__.py')];
        }
        case 'qualified':
        case 'unresolved':
            return [];
    }
}
const cFamily = (language) => language === 'c' || language === 'cpp';
const compatible = (from, to) => from.language === to.language
    || (cFamily(from.language) && cFamily(to.language));
function resolveImport(unit, item, byPath, qualified) {
    if (item.kind === 'lua' && (unit.bindings.has('require') || unit.declarations.some(declaration => declaration.name === 'require')))
        return undefined;
    if (item.kind === 'qualified') {
        const options = qualified.get(unit.language + ':' + item.spec) ?? [];
        return unique(options.filter(target => {
            const declaration = target.declaration;
            if (!declaration)
                return false;
            if (item.mode === 'type' || item.mode === 'staticType')
                return isType(declaration);
            if (item.mode === 'staticMember')
                return declaration.kind === 'method' && declaration.isStatic === true;
            return true;
        }));
    }
    if (item.kind === 'module' && item.member
        && !unit.imports.some(candidate => candidate.kind === 'module' && !candidate.member && candidate.spec === item.spec)) {
        return undefined;
    }
    const target = unique(physicalPaths(unit, item).flatMap(pathname => {
        const found = pathname && byPath.get(pathname);
        return found && compatible(unit, found) ? [found] : [];
    }));
    if (!target)
        return undefined;
    if (!item.member || (item.kind === 'python' && /^\.+$/u.test(item.spec)))
        return { unit: target };
    const declaration = unique(target.declarations.filter(candidate => candidate.name === item.member
        && isTopLevel(candidate) && (item.kind !== 'module' || candidate.isPublic === true)));
    return declaration ? { unit: target, declaration } : { unit: target };
}
function isType(declaration) {
    return ['class', 'interface', 'struct', 'enum', 'type', 'trait'].includes(declaration.kind);
}
function isTopLevel(declaration) {
    return !declaration.scope && !declaration.owner && !declaration.container;
}
function isTargetKind(declaration, kind) {
    if (kind === 'references')
        return declaration.kind === 'table' || declaration.kind === 'view';
    if (kind === 'constructs')
        return isType(declaration);
    return declaration.kind === 'function' || declaration.kind === 'method';
}
function aliasTargets(unit, reference, imported) {
    const { name, qualifier } = reference;
    if (!name)
        return undefined;
    const aliases = imported.filter(item => !item.syntax.owner && !item.syntax.scope
        && item.syntax.local === (qualifier ?? name) && item.syntax.mode !== 'staticType');
    if (!aliases.length)
        return undefined;
    if (aliases.length !== 1)
        return [];
    const importedTarget = aliases[0]?.target;
    if (!importedTarget)
        return [];
    const { unit: destination, declaration } = importedTarget;
    if (!qualifier) {
        if (!declaration)
            return [];
        const constructs = unit.language === 'kotlin' && isType(declaration);
        return (constructs || isTargetKind(declaration, reference.kind)) ? [{ unit: destination, declaration }] : [];
    }
    const members = destination.declarations.filter(candidate => (isTargetKind(candidate, reference.kind)
        && candidate.name === name
        && (declaration ? candidate.isStatic && candidate.namespace === declaration.namespace
            && candidate.container === declaration.name
            : isTopLevel(candidate) && (unit.language !== 'rust' || candidate.isPublic))));
    return members.map(member => ({ unit: destination, declaration: member }));
}
function sqlTargets(unit, name, reference, relations) {
    const targets = relations.get(sqlName(name)) ?? [];
    return targets.filter(target => target.declaration && isTargetKind(target.declaration, reference.kind)
        && (reference.qualifier || target.unit === unit));
}
function localTargets(unit, reference) {
    const { name, qualifier } = reference;
    const owner = reference.owner;
    const ownerClass = owner?.container || reference.container;
    const explicitSelf = qualifier && ((qualifier === 'this' && ['java', 'c_sharp', 'kotlin', 'cpp'].includes(unit.language))
        || (qualifier === 'self' && unit.language === 'rust')
        || (unit.language === 'go' && qualifier === owner?.receiver));
    return unit.declarations.flatMap(declaration => {
        if (!isTargetKind(declaration, reference.kind)
            && !(unit.language === 'kotlin' && !qualifier && isType(declaration)))
            return [];
        if (declaration.scope !== undefined && !reference.scopes.includes(declaration.scope))
            return [];
        if (declaration.owner && declaration.scope === undefined)
            return [];
        if (explicitSelf) {
            if (!ownerClass || declaration.container !== ownerClass || declaration.namespace !== reference.namespace)
                return [];
        }
        else if (qualifier) {
            // Only C++ scope-qualified calls qualify here. Object receivers require binding evidence.
            if (unit.language !== 'cpp' || !reference.expression.includes('::')
                || nameOf(declaration) !== qualifier + '.' + name)
                return [];
        }
        else {
            const lexicalMember = ['java', 'c_sharp', 'kotlin', 'cpp'].includes(unit.language);
            if (declaration.namespace !== reference.namespace || (declaration.container
                && (!lexicalMember || declaration.container !== ownerClass)))
                return [];
        }
        return normalize(unit, qualifier && !explicitSelf ? shortName(declaration.name) : declaration.name) === name
            ? [{ unit, declaration }] : [];
    });
}
function crossFileTargets(unit, reference, imported, goPackages) {
    if (reference.kind !== 'calls')
        return [];
    if (unit.language === 'go' && unit.packageName && !reference.qualifier) {
        const siblings = goPackages.get(goPackageKey(unit)) ?? [];
        const includeTests = unit.file.path.endsWith('_test.go');
        return siblings.filter(sibling => sibling !== unit && (includeTests || !sibling.file.path.endsWith('_test.go'))
            && !/^\/\/\s*(?:go:build|\+build)\s/mu.test(sibling.file.content ?? '')).flatMap(sibling => sibling.declarations
            .filter(declaration => isTopLevel(declaration) && declaration.kind === 'function' && declaration.name === reference.name)
            .map(declaration => ({ unit: sibling, declaration })));
    }
    if (cFamily(unit.language) && (!reference.qualifier || reference.expression.includes('::'))) {
        const files = new Set(imported.flatMap(item => item.target && item.syntax.kind === 'path'
            && !item.syntax.scope && !item.syntax.owner ? [item.target.unit] : []));
        return [...files].flatMap(file => file.declarations.filter(declaration => isTopLevel(declaration)
            && declaration.kind === 'function' && (reference.qualifier ? nameOf(declaration) === reference.qualifier + '.' + reference.name
            : declaration.namespace === reference.namespace && declaration.name === reference.name))
            .map(declaration => ({ unit: file, declaration })));
    }
    if (!reference.qualifier) {
        const types = imported.filter(item => item.syntax.mode === 'staticType' && item.target?.declaration);
        return types.flatMap(item => {
            const target = item.target;
            if (!target?.declaration)
                return [];
            const owner = target.declaration;
            return target.unit.declarations.filter(declaration => declaration.name === reference.name && declaration.kind === 'method'
                && declaration.isStatic && declaration.namespace === owner.namespace && declaration.container === owner.name)
                .map(declaration => ({ unit: target.unit, declaration }));
        });
    }
    return [];
}
function resolveReference(unit, reference, imported, goPackages, sqlDeclarations) {
    const { name, qualifier } = reference;
    if (!name)
        return undefined;
    const key = normalize(unit, name);
    if (unit.language === 'sql')
        return !qualifier && unit.bindings.has(key) ? undefined : unique(sqlTargets(unit, name, reference, sqlDeclarations));
    const bareBinding = normalize(unit, qualifier ?? name);
    if (unit.bindings.has(bareBinding))
        return undefined;
    const aliases = aliasTargets(unit, reference, imported);
    const local = localTargets(unit, { ...reference, name: key });
    const options = [...local, ...(aliases ?? crossFileTargets(unit, reference, imported, goPackages))];
    // A local declaration alongside an import with the same name is an ambiguous binding.
    if (aliases && local.length)
        return undefined;
    return options.length === 1 ? options[0] : undefined;
}
const goPackageKey = (unit) => path.posix.dirname(unit.file.path) + ':' + unit.packageName;
function addToIndex(index, key, item) {
    const entries = index.get(key);
    if (entries)
        entries.push(item);
    else
        index.set(key, [item]);
}
export async function extractAdditionalStructure(files, limitations) {
    const units = await parseAdditionalFiles(files, limitations);
    const byPath = new Map(units.map(unit => [unit.file.path, unit]));
    const qualified = new Map();
    const goPackages = new Map();
    const sqlDeclarations = new Map();
    for (const unit of units) {
        if (unit.language === 'go' && unit.packageName)
            addToIndex(goPackages, goPackageKey(unit), unit);
        for (const declaration of unit.declarations) {
            if (declaration.owner || declaration.scope !== undefined)
                continue;
            if (unit.language === 'sql')
                addToIndex(sqlDeclarations, sqlName(declaration.name), { unit, declaration });
            else
                addToIndex(qualified, unit.language + ':' + nameOf(declaration), { unit, declaration });
        }
    }
    const links = [];
    for (const unit of units) {
        const imported = unit.imports.map(syntax => ({ syntax, target: resolveImport(unit, syntax, byPath, qualified) }));
        for (const { syntax, target } of imported) {
            links.push({ unit, source: syntax, target, kind: 'imports', expression: [syntax.spec, syntax.member].filter(Boolean).join(' ').slice(0, 240) });
        }
        for (const reference of unit.references) {
            const target = resolveReference(unit, reference, imported, goPackages, sqlDeclarations);
            if (target?.declaration && reference.kind === 'calls' && unit.language === 'kotlin' && isType(target.declaration)) {
                links.push({ unit, source: reference, target, kind: 'constructs', expression: reference.expression });
                continue;
            }
            links.push({ unit, source: reference, target, kind: reference.kind, expression: reference.expression });
        }
    }
    return { units, links };
}
