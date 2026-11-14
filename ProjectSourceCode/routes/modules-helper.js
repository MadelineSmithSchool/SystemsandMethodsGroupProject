// shared utilities for the main, render, database, and config files.
export var linkSettings = [
    'source', 'countSource', 'sidesSource', 'keepHighestSource',
    'bonusSource', 'leftSource', 'rightSource'
];

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function flatten(list, output) {
    output = output || [];
    (list || []).forEach(function (module) {
        output.push(module);
        flatten(module.children, output);
    });
    return output;
}

export function findModule(list, id) {
    var entry = findModuleEntry(id, list);
    return entry ? entry.module : null;
}

export function findModuleEntry(id, list, parent) {
    var collection = list || [];
    for (var index = 0; index < collection.length; index += 1) {
        var module = collection[index];
        if (module.id === id) return { module: module, list: collection, parent: parent || null, index: index };
        var nested = findModuleEntry(id, module.children || [], module);
        if (nested) return nested;
    }
    return null;
}

export function layoutColumns(layout) {
    return Number(getComputedStyle(layout).getPropertyValue('--layout-columns').trim()) || 12;
}

export function isChecked(value) {
    return value === true || value === 'true' || value === '1' || value === 'on' ||
        (typeof value === 'number' && value !== 0);
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function parseListCellReference(source) {
    var match = /^(.+)\.(\d+)\.(\d+)$/.exec(String(source || ''));
    return match ? {
        moduleId: match[1],
        row: Number(match[2]) - 1,
        column: Number(match[3]) - 1
    } : null;
}

export function listCellKey(moduleId, row, column) {
    return moduleId + ':' + row + ':' + column;
}

export function collectLinks(module) {
    return linkSettings
        .map(function (key) { return module[key]; })
        .concat((module.modifiers || []).map(function (m) { return m && m.source; }))
        .concat((Array.isArray(module.stats) ? module.stats : []).map(function (s) { return s && s.source; }))
        .concat((Array.isArray(module.choices) ? module.choices : []).map(function (c) { return c && c.source; }))
        .filter(Boolean);
}

export function getListRows(module, playerRows) {
    var rows = module.rows || [];
    return (playerRows && playerRows[module.id]) ? rows.concat(playerRows[module.id]) : rows;
}
