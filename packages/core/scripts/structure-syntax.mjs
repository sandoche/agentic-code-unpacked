// Generated from packages/core/src/scripts/structure-syntax.mts. Edit that source, then run pnpm skills:build.
import path from 'node:path';
import { importDependency, resolveDependency } from './dependencies.mjs';
import { message } from './values.mjs';
const languages = {
    sql: ['.sql'],
    python: ['.py', '.pyi', '.pyw'],
    bash: ['.sh', '.bash'],
    java: ['.java'],
    c_sharp: ['.cs'],
    powershell: ['.ps1', '.psm1'],
    cpp: ['.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx'],
    c: ['.c', '.h'],
    rust: ['.rs'],
    go: ['.go'],
    kotlin: ['.kt', '.kts'],
    lua: ['.lua'],
};
const languageByExtension = new Map();
function isLanguageId(name) {
    return Object.hasOwn(languages, name);
}
for (const [language, extensions] of Object.entries(languages)) {
    if (!isLanguageId(language))
        continue;
    for (const extension of extensions)
        languageByExtension.set(extension, language);
}
const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const dottedName = /^[\p{L}_][\p{L}\p{N}_]*(?:[.:]{1,2}[\p{L}_][\p{L}\p{N}_]*)*$/u;
const commandName = /^[\p{L}_][\p{L}\p{N}_-]*$/u;
const firstOf = (node, type) => node.namedChildren.find(child => child.type === type);
const field = (node, name) => node.childForFieldName(name) ?? undefined;
const span = (node) => ({
    startLine: node.startPosition.row + 1,
    endLine: Math.max(node.startPosition.row + 1, node.endPosition.row + (node.endPosition.column > 0 ? 1 : 0)),
});
const normalizedName = (name) => name.replace(/::|:/g, '.');
const types = {
    class_definition: 'class', class_declaration: 'class', class_specifier: 'class', object_declaration: 'class',
    interface_declaration: 'interface', struct_specifier: 'struct', struct_item: 'struct', struct_declaration: 'struct',
    union_specifier: 'type', union_item: 'type', enum_specifier: 'enum', enum_item: 'enum', enum_declaration: 'enum',
    trait_item: 'trait', record_declaration: 'class', record_struct_declaration: 'struct', type_item: 'type',
    type_spec: 'type', type_alias: 'type', typealias_declaration: 'type',
};
const functions = new Set([
    'function_definition', 'function_declaration', 'function_item', 'function_statement', 'method_declaration',
    'constructor_declaration', 'local_function_statement', 'function_signature_item',
]);
const lexicalBlocks = new Set([
    'block', 'compound_statement', 'constructor_body', 'function_body', 'script_block', 'block_expression',
    'lambda', 'lambda_expression', 'closure_expression', 'anonymous_function', 'function_expression', 'function_value',
]);
const branchingStatements = new Set([
    'if_statement', 'if_expression', 'conditional_statement', 'switch_statement', 'match_expression', 'try_statement',
    'for_statement', 'for_in_statement', 'while_statement', 'repeat_statement', 'foreach_statement', 'preproc_if',
    'preproc_ifdef', 'preproc_else', 'preproc_elif',
]);
function cName(node) {
    let declarator = field(node, 'declarator');
    while (declarator) {
        if (['identifier', 'field_identifier', 'qualified_identifier'].includes(declarator.type))
            return declarator;
        declarator = field(declarator, 'declarator');
    }
    return undefined;
}
function declaration(node, scope, language) {
    const { type } = node;
    let kind = types[type];
    let nameNode = field(node, 'name');
    let container = kind ? scope.container : '';
    let receiver;
    if (kind && (language === 'c' || language === 'cpp') && type.endsWith('_specifier') && !field(node, 'body'))
        return undefined;
    if (functions.has(type)) {
        container = scope.container;
        if (language === 'c' || language === 'cpp')
            nameNode = cName(node);
        if (language === 'powershell')
            nameNode = firstOf(node, 'function_name');
        if (language === 'go' && type === 'method_declaration') {
            const parameter = field(node, 'receiver')?.firstNamedChild ?? undefined;
            const ownerType = parameter && field(parameter, 'type');
            container = (ownerType?.type === 'pointer_type' ? ownerType.firstNamedChild?.text : ownerType?.text) ?? '';
            receiver = parameter && field(parameter, 'name')?.text;
        }
        kind = type === 'constructor_declaration' ? 'constructor' : container && !scope.owner ? 'method' : 'function';
    }
    if (language === 'sql') {
        kind = type === 'create_table' ? 'table' : ['create_view', 'create_materialized_view'].includes(type) ? 'view'
            : ['create_function', 'create_procedure'].includes(type) ? 'function' : undefined;
        nameNode = firstOf(node, 'object_reference');
    }
    if (kind && !nameNode && language === 'kotlin') {
        nameNode = node.namedChildren.find(child => child.type === 'simple_identifier' || child.type === 'type_identifier');
    }
    const rawName = nameNode?.text;
    if (!kind || !rawName)
        return undefined;
    const name = language === 'sql' ? rawName : normalizedName(rawName);
    const script = language === 'powershell' || language === 'bash';
    if (script ? !commandName.test(name) : language !== 'sql' && !dottedName.test(name))
        return undefined;
    return {
        ...span(node), kind, name, offset: node.startIndex, namespace: scope.namespace, container,
        ...(receiver ? { receiver } : {}), ...(scope.owner ? { owner: scope.owner } : {}),
        ...(node.namedChildren.some(child => child.type === 'modifier' && child.text === 'static'
            || child.type === 'modifiers' && child.children.some(part => part.type === 'static')) ? { isStatic: true } : {}),
        ...(node.namedChildren.some(child => child.type === 'visibility_modifier' && /^(?:pub|pub\(super\))$/u.test(child.text))
            ? { isPublic: true } : {}),
        ...(scope.scopes.length ? { scope: scope.scopes.at(-1) } : {}),
    };
}
function reference(node, scope, language) {
    let expression;
    let kind = 'calls';
    switch (node.type) {
        case 'call':
        case 'call_expression':
        case 'invocation_expression':
        case 'function_call':
            expression = (field(node, 'function') ?? field(node, 'name') ?? node.firstNamedChild)?.text;
            break;
        case 'method_invocation': {
            const method = field(node, 'name')?.text;
            const object = field(node, 'object')?.text;
            if (method)
                expression = object ? object + '.' + method : method;
            break;
        }
        case 'object_creation_expression':
        case 'new_expression':
            expression = field(node, 'type')?.text;
            kind = 'constructs';
            break;
        case 'command':
            if (language === 'bash' || language === 'powershell') {
                expression = (field(node, 'command_name') ?? field(node, 'name'))?.text;
            }
            break;
        case 'invocation':
        case 'relation':
        case 'alter_table':
        case 'insert':
        case 'update':
        case 'delete':
            if (language === 'sql') {
                expression = firstOf(node, 'object_reference')?.text;
                kind = node.type === 'invocation' ? 'calls' : 'references';
            }
            break;
    }
    if (!expression)
        return undefined;
    const base = { ...span(node), kind, expression: expression.slice(0, 240), ...scope };
    if (language === 'sql') {
        const object = firstOf(node, 'object_reference');
        const schema = object && (field(object, 'schema') ?? field(object, 'database'))?.text;
        return { ...base, name: expression, ...(schema ? { qualifier: schema } : {}) };
    }
    if (language === 'powershell' || language === 'bash')
        return commandName.test(expression) ? { ...base, name: expression } : base;
    const simple = normalizedName(expression);
    if (!dottedName.test(simple))
        return base;
    const lastDot = simple.lastIndexOf('.');
    return lastDot < 0 ? { ...base, name: simple } : { ...base, qualifier: simple.slice(0, lastDot), name: simple.slice(lastDot + 1) };
}
function pythonImports(node) {
    if (!['import_statement', 'import_from_statement'].includes(node.type))
        return [];
    const moduleName = field(node, 'module_name')?.text ?? '';
    return node.childrenForFieldName('name').map(name => {
        const member = field(name, 'name')?.text ?? name.text;
        const local = field(name, 'alias')?.text ?? member.split('.')[0];
        return moduleName.startsWith('.') && identifier.test(member)
            ? { kind: 'python', spec: moduleName, member, ...(local ? { local } : {}) }
            : { kind: 'unresolved', spec: [moduleName, member].filter(Boolean).join(' '), ...(local ? { local } : {}) };
    });
}
function qualifiedImport(node, language) {
    let spec;
    let local;
    let mode;
    if (node.type === 'import_declaration' && language === 'java') {
        const match = /^import\s+(?:(static)\s+)?([\w.*]+)\s*;$/u.exec(node.text);
        spec = match?.[2];
        mode = match?.[1] ? 'staticMember' : 'type';
    }
    else if (node.type === 'using_directive' && language === 'c_sharp' && node.parent?.type === 'compilation_unit') {
        const match = /^(?:global\s+)?using\s+(?:(?<alias>\w+)\s*=\s*|static\s+)(?<spec>[\w.]+)\s*;$/u.exec(node.text);
        spec = match?.groups?.spec;
        local = match?.groups?.alias;
        mode = local ? 'type' : 'staticType';
    }
    else if (node.type === 'import_header' && language === 'kotlin') {
        spec = firstOf(node, 'identifier')?.text;
        if (spec && /\.\*\s*;?$/u.test(node.text))
            return { kind: 'unresolved', spec: spec + '.*' };
        local = firstOf(node, 'import_alias')?.firstNamedChild?.text;
    }
    if (!spec)
        return undefined;
    local ??= spec.split('.').at(-1);
    return { kind: dottedName.test(spec) ? 'qualified' : 'unresolved', spec, ...(local ? { local } : {}), ...(mode ? { mode } : {}) };
}
function imports(node, language) {
    if (language === 'python')
        return pythonImports(node);
    const qualified = qualifiedImport(node, language);
    if (qualified)
        return [qualified];
    if (node.type === 'preproc_include') {
        const name = field(node, 'path');
        const spec = name?.type === 'string_literal' ? firstOf(name, 'string_content')?.text : undefined;
        return spec ? [{ kind: 'path', spec }] : [{ kind: 'unresolved', spec: name?.text ?? node.text.trim() }];
    }
    if (language === 'rust' && node.parent?.type === 'source_file') {
        if (node.type === 'mod_item' && !field(node, 'body')) {
            const name = field(node, 'name')?.text;
            if (name)
                return [{ kind: node.previousNamedSibling?.type === 'attribute_item' ? 'unresolved' : 'module', spec: name, local: name }];
        }
        if (node.type === 'use_declaration') {
            const parts = /^use\s+self::(\w+)::(\w+)(?:\s+as\s+(\w+))?\s*;$/u.exec(node.text);
            if (parts?.[1] && parts[2])
                return [{ kind: 'module', spec: parts[1], member: parts[2], local: parts[3] ?? parts[2] }];
            return [{ kind: 'unresolved', spec: field(node, 'argument')?.text ?? node.text }];
        }
    }
    if (language === 'go' && node.type === 'import_spec') {
        return [{ kind: 'unresolved', spec: field(node, 'path')?.text ?? node.text }];
    }
    if (language === 'lua' && node.type === 'function_call' && field(node, 'name')?.text === 'require') {
        const args = field(node, 'arguments')?.namedChildren ?? [];
        const literal = args[0];
        const spec = literal && args.length === 1 && literal.type === 'string' && field(literal, 'content')?.text;
        return spec && /^\w+(?:\.\w+)*$/u.test(spec) ? [{ kind: 'lua', spec }] : [{ kind: 'unresolved', spec: 'require ' + (literal?.text ?? '') }];
    }
    if (node.type !== 'command')
        return [];
    if (language === 'bash' && ['.', 'source'].includes(field(node, 'name')?.text ?? '')) {
        const argument = field(node, 'argument')?.text ?? '';
        const spec = /^"\$\{BASH_SOURCE\[0\]%\/\*\}\/([^"$\\]+)"$/u.exec(argument)?.[1]
            ?? /^"\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/([^"$\\]+)"$/u.exec(argument)?.[1];
        return spec ? [{ kind: 'path', spec }] : [{ kind: 'unresolved', spec: node.text }];
    }
    if (language === 'powershell') {
        const prefix = /^(?:\.\s+|import-module\s+|using\s+module\s+)/iu.exec(node.text);
        if (!prefix)
            return [];
        const spec = /^"\$(?:PSScriptRoot|\{PSScriptRoot\})[\\/]([^"$\r\n]+)"(?:\s|$)/iu.exec(node.text.slice(prefix[0].length))?.[1];
        return spec ? [{ kind: 'path', spec: spec.replaceAll('\\', '/') }] : [{ kind: 'unresolved', spec: node.text }];
    }
    return [];
}
const bindingFields = {
    assignment: ['left'], augmented_assignment: ['left'], assignment_statement: ['left'],
    chained_assignment_expression: ['left'], assignment_expression: ['left'], short_var_declaration: ['left'],
    variable_assignment: ['name'], variable_declarator: ['name'], variable_list: ['name'], var_spec: ['name'],
    const_spec: ['name'], init_declarator: ['declarator'], as_pattern: ['alias'], for_in_clause: ['left'], parameter: ['name', 'pattern'], parameter_declaration: ['name', 'declarator'],
    formal_parameter: ['name'], default_parameter: ['name'], typed_default_parameter: ['name'],
    let_declaration: ['pattern'], for_statement: ['left', 'pattern'], for_in_statement: ['left', 'pattern'],
    catch_declaration: ['name'], aliasing: ['alias'],
};
const bindingLists = new Set(['script_parameter', 'parameters', 'typed_parameter',
    'lambda_parameters', 'for_numeric_clause', 'for_generic_clause', 'foreach_statement', 'cte', 'common_table_expression']);
const bindingLeaf = new Set(['identifier', 'simple_identifier', 'variable', 'variable_name', 'field_identifier']);
function recordBindings(node, names) {
    const pending = [node];
    while (pending.length) {
        const current = pending.pop();
        if (!current)
            continue;
        if (bindingLeaf.has(current.type))
            names.add(current.text.replace(/^\$/u, ''));
        else
            pending.push(...current.namedChildren);
    }
}
function packageName(root, language) {
    const kind = language === 'go' ? 'package_clause' : language === 'java' ? 'package_declaration'
        : language === 'kotlin' ? 'package_header' : language === 'c_sharp' ? 'file_scoped_namespace_declaration' : undefined;
    if (!kind)
        return '';
    const node = firstOf(root, kind);
    return (node && (field(node, 'name') ?? node.firstNamedChild)?.text) ?? '';
}
const cFamily = (language) => language === 'c' || language === 'cpp';
const typeContainers = new Set(['class', 'struct', 'interface', 'enum', 'trait']);
function readTree(root, file, language) {
    const unit = { file, language, packageName: packageName(root, language), declarations: [], references: [], imports: [], bindings: new Set() };
    const initialScope = { namespace: unit.packageName, container: '', scopes: [] };
    const stack = [{ node: root, scope: initialScope }];
    for (let entry = stack.pop(); entry; entry = stack.pop()) {
        const { node, scope } = entry;
        let childScope = scope;
        const declared = declaration(node, scope, language);
        if (declared) {
            unit.declarations.push(declared);
            if (typeContainers.has(declared.kind)) {
                childScope = { ...scope, container: [scope.container, declared.name].filter(Boolean).join('.') };
            }
            else {
                childScope = { ...scope, owner: declared, container: declared.container || scope.container };
            }
        }
        else if (['namespace_definition', 'namespace_declaration'].includes(node.type)) {
            const name = field(node, 'name')?.text;
            if (name)
                childScope = { ...scope, namespace: [scope.namespace, normalizedName(name)].filter(Boolean).join('.') };
        }
        else if (node.type === 'impl_item') {
            const name = field(node, 'type')?.text;
            if (name && identifier.test(name))
                childScope = { ...scope, container: name };
        }
        else if (node.type === 'mod_item' && field(node, 'body')) {
            const name = field(node, 'name')?.text;
            if (name)
                childScope = { ...scope, namespace: [scope.namespace, name].filter(Boolean).join('.') };
        }
        if (lexicalBlocks.has(node.type) || branchingStatements.has(node.type)) {
            childScope = { ...childScope, scopes: [...childScope.scopes, node.id] };
        }
        const recordedImports = imports(node, language);
        if (recordedImports.length) {
            for (const item of recordedImports) {
                unit.imports.push({ ...item, ...span(node), scope: scope.scopes.at(-1), ...(scope.owner ? { owner: scope.owner } : {}) });
            }
        }
        else {
            const recorded = reference(node, scope, language);
            if (recorded)
                unit.references.push(recorded);
        }
        // Withhold a link if a variable or parameter could shadow a known declaration.
        const goReceiver = language === 'go' && node.type === 'parameter_declaration'
            && node.parent?.parent && field(node.parent.parent, 'receiver')?.id === node.parent.id;
        if (!goReceiver) {
            for (const name of bindingFields[node.type] ?? []) {
                for (const binding of node.childrenForFieldName(name))
                    recordBindings(binding, unit.bindings);
            }
        }
        if (language === 'kotlin' && ['variable_declaration', 'parameter', 'class_parameter'].includes(node.type) && node.firstNamedChild) {
            recordBindings(node.firstNamedChild, unit.bindings);
        }
        if (cFamily(language) && node.type === 'declaration') {
            for (const bound of node.childrenForFieldName('declarator')) {
                if (bound.type === 'function_declarator' && field(bound, 'declarator')?.type === 'identifier')
                    continue;
                if (bound.type !== 'init_declarator')
                    recordBindings(bound, unit.bindings);
            }
        }
        if (bindingLists.has(node.type))
            recordBindings(node, unit.bindings);
        const children = node.namedChildren;
        for (let index = children.length - 1; index >= 0; index--) {
            const child = children[index];
            if (child)
                stack.push({ node: child, scope: childScope });
        }
    }
    if (language === 'powershell' || language === 'sql')
        unit.bindings = new Set([...unit.bindings].map(name => name.toLowerCase()));
    return unit;
}
let treeSitter;
const grammars = new Map();
function loadRuntime() {
    treeSitter ??= importDependency('web-tree-sitter').then(async (engine) => {
        await engine.Parser.init();
        return engine;
    }).catch((error) => {
        treeSitter = undefined;
        throw error;
    });
    return treeSitter;
}
function loadGrammar(language) {
    const existing = grammars.get(language);
    if (existing)
        return existing;
    const pending = loadRuntime().then(async (engine) => {
        return engine.Language.load(await resolveDependency('tree-sitter-wasm/' + language + '/tree-sitter-' + language + '.wasm'));
    }).catch((error) => {
        grammars.delete(language);
        throw error;
    });
    grammars.set(language, pending);
    return pending;
}
export async function parseAdditionalFiles(files, limitations) {
    const candidates = files.flatMap(file => {
        const language = languageByExtension.get(path.posix.extname(file.path).toLowerCase());
        return language && typeof file.content === 'string' && !file.selectedRange ? [{ file, content: file.content, language }] : [];
    });
    if (!candidates.length)
        return [];
    const units = [];
    for (const { file, content, language } of candidates) {
        const prefix = file.path + ': structure omitted (Tree-sitter ';
        try {
            const { Parser } = await loadRuntime();
            const parser = new Parser();
            try {
                // A header may contain C or C++ syntax. Prefer C when both grammars can parse it.
                for (const dialect of file.path.toLowerCase().endsWith('.h') ? ['c', 'cpp'] : [language]) {
                    parser.setLanguage(await loadGrammar(dialect));
                    const tree = parser.parse(content);
                    if (!tree)
                        continue;
                    try {
                        if (tree.rootNode.hasError)
                            continue;
                        units.push(readTree(tree.rootNode, file, dialect));
                        break;
                    }
                    finally {
                        tree.delete();
                    }
                }
                if (units.at(-1)?.file !== file)
                    limitations.push(prefix + 'parser diagnostics)');
            }
            finally {
                parser.delete();
            }
        }
        catch (error) {
            limitations.push(prefix + message(error).split('\n')[0] + ')');
        }
    }
    return units;
}
