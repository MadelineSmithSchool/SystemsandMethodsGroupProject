// checks, saves, and restores the sheet, the main file calls it and it uses shared helpers.
import { flatten, linkSettings } from './modules-helper.js';

var defaultKey = 'sheet-studio-draft';

// keep the saved sheet in the same format.
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

    // check both regular links and links used for conditional changes.
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

    // track which modules are being checked so linked modules cannot loop forever.
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