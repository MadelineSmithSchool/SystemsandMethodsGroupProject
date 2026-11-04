export function serialize(doc) {
    return {
        schemaVersion: 1,
        name: doc.name,
        description: doc.description,
        modules: doc.modules
    };
}

export function validate(doc) {
    var problems = [];
    if (!doc || typeof doc !== 'object') return ['Template data is missing.'];
    var modules = Array.isArray(doc.modules) ? doc.modules : [];
    var entries = new Map();
    var references = [
        'source',
        'countSource',
        'sidesSource',
        'keepHighestSource',
        'bonusSource',
        'leftSource',
        'rightSource'
    ];

    if (!doc.name || !doc.name.trim()) problems.push('Enter a sheet name.');
    if (!modules.length) problems.push('Add at least one module.');

    function collect(list) {
        list.forEach(function (module) {
            entries.set(module.id, module);
            collect(module.children || []);
        });
    }
    collect(modules);

    entries.forEach(function (module) {
        if (!module.name || !module.name.trim()) problems.push('Every module needs a name.');
        references.forEach(function (key) {
            if (module[key] && !entries.has(module[key])) {
                problems.push('"' + module.name + '" links to a missing module.');
            }
        });
        (module.modifiers || []).forEach(function (modifier) {
            if (modifier.source && !entries.has(modifier.source)) {
                problems.push('"' + module.name + '" has a conditional change linked to a missing module.');
            }
        });
    });

    var visiting = new Set();
    var visited = new Set();
    function visit(id) {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        var module = entries.get(id);
        var linked = module ? references.map(function (key) { return module[key]; }).filter(Boolean)
            .concat((module.modifiers || []).map(function (modifier) { return modifier.source; }).filter(Boolean)) : [];
        for (var index = 0; index < linked.length; index += 1) {
            if (entries.has(linked[index]) && visit(linked[index])) return true;
        }
        visiting.delete(id);
        visited.add(id);
        return false;
    }
    entries.forEach(function (module, id) {
        if (visit(id)) {
            problems.push('Module links contain a cycle.');
            visiting.clear();
            visited.clear();
        }
    });

    return Array.from(new Set(problems));
}

export function downloadJson(doc) {
    return JSON.stringify(serialize(doc), null, 2);
}

export async function saveDraft(doc, url, csrfToken) {
    return post(doc, url, csrfToken);
}

export async function publish(doc, url, csrfToken) {
    return post(doc, url, csrfToken);
}

async function post(doc, url, csrfToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    var response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(serialize(doc))
    });
    if (!response.ok) {
        var message = 'The request could not be completed.';
        try {
            var result = await response.json();
            message = result.error || message;
        } catch (error) {
            if (response.status !== 404) throw error;
        }
        throw new Error(message);
    }
    return response;
}

export function autosave(doc, key) {
    var draft = serialize(doc);
    draft.savedPresets = doc.savedPresets || [];
    localStorage.setItem(key || 'sheet-studio-draft', JSON.stringify(draft));
}

export function restore(key) {
    var saved = localStorage.getItem(key || 'sheet-studio-draft');
    return saved ? JSON.parse(saved) : null;
}
