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

export function availableGroupColumns(groupCard) {
    var grid = groupCard && groupCard.querySelector('.group-field-grid');
    if (!grid) return 6;
    var style = getComputedStyle(grid);
    var padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    var gap = parseFloat(style.columnGap) || 0;
    var contentWidth = Math.max(0, grid.clientWidth - padding);
    return Math.max(1, Math.min(6, Math.floor((contentWidth + gap) / (80 + gap))));
}

export function isChecked(value) {
    return value === true || value === 'true' || value === '1' || value === 'on' ||
        (typeof value === 'number' && value !== 0);
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function selectionBounds(items) {
    var left = Math.min.apply(null, items.map(function (item) { return item.placement.col; }));
    var top = Math.min.apply(null, items.map(function (item) { return item.placement.row; }));
    var right = Math.max.apply(null, items.map(function (item) {
        return item.placement.col + item.placement.colSpan;
    }));
    var bottom = Math.max.apply(null, items.map(function (item) {
        return item.placement.row + item.placement.rowSpan;
    }));
    return { col: left, row: top, width: right - left, height: bottom - top };
}

export function scaledSelection(items, bounds, width, height) {
    return items.map(function (item) {
        var original = item.placement;
        var left = Math.round((original.col - bounds.col) * width / bounds.width);
        var right = Math.round((original.col + original.colSpan - bounds.col) * width / bounds.width);
        var top = Math.round((original.row - bounds.row) * height / bounds.height);
        var bottom = Math.round((original.row + original.rowSpan - bounds.row) * height / bounds.height);
        return {
            id: item.id,
            placement: { col: bounds.col + left, row: bounds.row + top, colSpan: right - left, rowSpan: bottom - top }
        };
    });
}

export function fitSelectionResize(items, bounds, columns, columnsMoved, rowsMoved, canFit) {
    var width = clamp(bounds.width + columnsMoved, 1, columns - bounds.col + 1);
    var height = Math.max(1, bounds.height + rowsMoved);
    var steps = Math.max(Math.abs(width - bounds.width), Math.abs(height - bounds.height));

    for (var step = steps; step > 0; step -= 1) {
        var candidate = scaledSelection(items, bounds,
            bounds.width + Math.round((width - bounds.width) * step / steps),
            bounds.height + Math.round((height - bounds.height) * step / steps));
        if (candidate.every(function (item) {
            return item.placement.colSpan >= 1 && item.placement.rowSpan >= 1;
        }) && canFit(candidate)) return candidate;
    }
    return items;
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
