// saves, restores, and checks builder data; the main file calls it and it uses shared helpers.
import { flatten, linkSettings } from './modules-helper.js';

var defaultKey = 'sheet-studio-draft';

// keep saved data in one stable shape.
export function serialize(doc) {
    return {
        schemaVersion: 1,
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
    var marks = {};

    if (!doc.name || !doc.name.trim()) problems.push('Enter a sheet name.');
    if (!modules.length) problems.push('Add at least one module.');

    // value links and conditional change sources both count as links.
    function linksOf(module) {
        return linkSettings.map(function (key) { return module[key]; })
            .concat((module.modifiers || []).map(function (modifier) { return modifier.source; }))
            .filter(Boolean);
    }

    entries.forEach(function (module) {
        if (!module.name || !module.name.trim()) problems.push('Every module needs a name.');
        linkSettings.forEach(function (key) {
            if (module[key] && !entries.has(module[key])) problems.push('"' + module.name + '" links to a missing module.');
        });
        (module.modifiers || []).forEach(function (modifier) {
            if (modifier.source && !entries.has(modifier.source)) {
                problems.push('"' + module.name + '" has a conditional change linked to a missing module.');
            }
        });
    });

    // marks: 1 means on the current path, 2 means fully checked.
    function hasCycle(id) {
        if (marks[id] === 1) return true;
        if (marks[id] === 2 || !entries.has(id)) return false;
        marks[id] = 1;
        var found = linksOf(entries.get(id)).some(hasCycle);
        marks[id] = 2;
        return found;
    }
    if (Array.from(entries.keys()).some(hasCycle)) problems.push('Module links contain a cycle.');

    return Array.from(new Set(problems));
}

export function downloadJson(doc) {
    return JSON.stringify(serialize(doc), null, 2);
}

// used for both drafts and publishing, only the url differs.
export async function save(doc, url, csrfToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    var response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(serialize(doc)) });
    if (!response.ok) {
        var result = await response.json().catch(function () { return {}; });
        throw new Error(result.error || 'The request could not be completed.');
    }
    return response;
}

export function autosave(doc, key) {
    // saved presets stay in the local draft even though exports omit them.
    var draft = Object.assign(serialize(doc), { savedPresets: doc.savedPresets || [] });
    localStorage.setItem(key || defaultKey, JSON.stringify(draft));
}

export function restore(key) {
    var saved = localStorage.getItem(key || defaultKey);
    return saved ? JSON.parse(saved) : null;
}