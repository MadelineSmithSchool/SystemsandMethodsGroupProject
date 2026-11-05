// helpers used by the database, main, and render files.
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
    return flatten(list).find(function (module) { return module.id === id; }) || null;
}

export function layoutColumns(layout) {
    return Number(getComputedStyle(layout).getPropertyValue('--layout-columns').trim()) || 12;
}