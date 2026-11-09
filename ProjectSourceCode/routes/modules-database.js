// checks, saves, and restores the sheet, the main file calls it and it uses shared helpers.
import { flatten, linkSettings, parseListCellReference, collectLinks } from './modules-helper.js';

var defaultKey = 'sheet-studio-draft';

// keep the saved sheet in the same format.
export function serialize(doc) {
    return {
        schemaVersion: 2,
        name: doc.name,
        description: doc.description,
        modules: doc.modules
    };
}

export function validate(doc) {
    if (!doc || typeof doc !== 'object') return ['Template data is missing.'];
    var problems = [];
    var modules = Array.isArray(doc.modules) ? doc.modules : [];
    var entries = new Map(flatten(modules).map(function (module) { return [module.id, module]; }));
    var listCells = new Map();
    var marks = {};

    if (!doc.name || !doc.name.trim()) problems.push('Enter a sheet name.');
    if (!modules.length) problems.push('Add at least one module.');

    entries.forEach(function (module) {
        if (module.type !== 'list' || !Array.isArray(module.rows) || !Array.isArray(module.columns)) return;
        module.rows.forEach(function (_, row) {
            module.columns.forEach(function (column, index) {
                if (!column || !['number', 'checkbox'].includes(column.type)) return;
                var id = module.id + '.' + (row + 1) + '.' + (index + 1);
                listCells.set(id, {
                    source: column.rowSources && column.rowSources[row] || column.source || ''
                });
            });
        });
    });

    // check both regular links and links used for conditional changes.
    function linkTarget(source) {
        return String(source || '').replace(/\.length$/, '');
    }

    function validLink(source) {
        var target = entries.get(linkTarget(source));
        return Boolean(target && (!String(source).endsWith('.length') || target.type === 'list'));
    }

    function linksOf(module) {
        return linkSettings.map(function (key) { return module[key]; })
            .concat((module.modifiers || []).map(function (modifier) { return modifier && modifier.source; }))
            .concat((Array.isArray(module.stats) ? module.stats : []).map(function (stat) { return stat && stat.source; }))
            .concat((Array.isArray(module.columns) ? module.columns : []).map(function (column) { return column && column.source; }))
            .map(linkTarget)
            .filter(Boolean);
    }

    entries.forEach(function (module) {
        if (!module.name || !module.name.trim()) problems.push('Every module needs a name.');
        if (module.type === 'list') {
            if (!Array.isArray(module.columns) || !module.columns.length ||
                module.columns.some(function (column) {
                    return !column || typeof column.name !== 'string' ||
                        !['text', 'number', 'dice'].includes(column.type) ||
                        (column.source !== undefined && typeof column.source !== 'string');
                })) {
                problems.push('Every list needs columns with a valid name, value type, and input source.');
            }
            if (!Array.isArray(module.rows) ||
                module.rows.some(function (row) {
                    return !row || !Array.isArray(row.cells) ||
                        !Array.isArray(module.columns) || row.cells.length !== module.columns.length;
                })) {
                problems.push('Every list row must have a value for each column.');
            }
            if (module.stats !== undefined && (!Array.isArray(module.stats) ||
                module.stats.some(function (stat) {
                    return !stat || typeof stat.name !== 'string' ||
                        (stat.source !== undefined && typeof stat.source !== 'string');
                }))) {
                problems.push('Every list stat must have a valid name and input source.');
            }
        }
        linkSettings.forEach(function (key) {
            if (module[key] && !validLink(module[key])) problems.push('"' + module.name + '" links to a missing module.');
        });
        (module.modifiers || []).forEach(function (modifier) {
            if (modifier.source && !validLink(modifier.source)) {
                problems.push('"' + module.name + '" has a conditional change linked to a missing module.');
            }
        });
        (Array.isArray(module.stats) ? module.stats : []).forEach(function (stat) {
            if (stat && stat.source && !validLink(stat.source)) {
                problems.push('"' + module.name + '" has a stat linked to a missing module.');
            }
        });
        (Array.isArray(module.columns) ? module.columns : []).forEach(function (column) {
            if (column && column.source && !validLink(column.source)) {
                problems.push('"' + module.name + '" has a column linked to a missing module.');
            }
        });
    });

    // track which modules are being checked so linked modules cannot loop forever.
    function hasCycle(id) {
        if (marks[id] === 1) return true;
        if (marks[id] === 2 || (!entries.has(id) && !listCells.has(id))) return false;
        marks[id] = 1;
        var cell = listCells.get(id);
        var sources = cell ? [cell.source] : linksOf(entries.get(id));
        var found = sources.map(linkTarget).filter(Boolean).some(hasCycle);
        marks[id] = 2;
        return found;
    }
    if (Array.from(entries.keys()).concat(Array.from(listCells.keys())).some(hasCycle)) {
        problems.push('Module links contain a cycle.');
    }

    return Array.from(new Set(problems));
}

export function downloadJson(doc) {
    return JSON.stringify(serialize(doc), null, 2);
}

// use the same save request for drafts and publishing.
export async function save(doc, url, csrfToken, privacyLevel, templateId) {
    var headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    var payload = Object.assign(serialize(doc), { privacyLevel: privacyLevel });
    if (templateId) payload.templateId = templateId;
    var response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
    if (!response.ok) {
        var result = await response.json().catch(function () { return {}; });
        throw new Error(result.error || 'The request could not be completed.');
    }
    return response.json();
}

export function autosave(doc, key) {
    // keep saved presets in the local draft; they are not part of an export.
    var draft = Object.assign(serialize(doc), { savedPresets: doc.savedPresets || [] });
    localStorage.setItem(key || defaultKey, JSON.stringify(draft));
}

export function restore(key) {
    var saved = localStorage.getItem(key || defaultKey);
    return saved ? JSON.parse(saved) : null;
}

export function clearAutosave(key) {
    localStorage.removeItem(key || defaultKey);
}