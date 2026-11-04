import {
    autosave,
    downloadJson,
    publish,
    restore,
    saveDraft,
    validate
} from './modules-database.js';
import {
    renderCanvas,
    renderInspector,
    renderSavedPresets,
    updatePresetSelection,
    updateLiveValues
} from './modules-render.js';

/* 1. State */
var studio = document.querySelector('[data-sheet-studio]');
if (studio) {
    var rootCanvas = studio.querySelector('[data-root-canvas]');
    var numericSettings = [
        'value', 'count', 'sides', 'uncheckedValue', 'checkedValue',
        'keepHighest', 'leftValue', 'rightValue'
    ];
    var linkSettings = [
        'source', 'countSource', 'sidesSource', 'keepHighestSource',
        'bonusSource', 'leftSource', 'rightSource'
    ];

    var state = {
        document: {
            name: '',
            description: '',
            modules: [],
            savedPresets: []
        },
        ui: {
            mode: 'developer',
            selectedId: null,
            selectedModuleIds: [],
            activeDrag: null,
            suppressToolClick: false
        },
        player: {
            values: {},
            checked: {},
            rollResults: {}
        },
        history: {
            undo: [],
            redo: []
        },
        nextModuleId: 1
    };

    /* 2. Module type table */
    var moduleTypes = {
        number: {
            name: 'Number', control: 'number', valueKind: 'number', inspector: ['source', 'value', 'conditional'],
            links: ['source'], defaults: {
                value: '10', checked: false, visibility: 'shown', count: 1, countSource: '',
                sides: 20, sidesSource: '', source: '', modifiers: [], children: [],
                uncheckedValue: 0, checkedValue: 1, keepHighest: 0, keepHighestSource: '',
                bonusSource: '', mathOperation: 'add', mathRounding: 'none',
                leftValue: 0, leftSource: '', rightValue: 0, rightSource: ''
            }
        },
        text: {
            name: 'Text', control: 'text', valueKind: 'input', inspector: ['source'], links: ['source'],
            defaults: { value: '', source: '', visibility: 'shown', modifiers: [], children: [] }
        },
        dice: {
            name: 'Dice', control: 'dice', valueKind: 'dice', inspector: ['dice'],
            links: ['countSource', 'sidesSource', 'keepHighestSource', 'bonusSource'],
            defaults: {
                value: '', count: 1, countSource: '', sides: 20, sidesSource: '',
                keepHighest: 0, keepHighestSource: '', bonusSource: '', source: '',
                visibility: 'shown', modifiers: [], children: []
            }
        },
        checkbox: {
            name: 'Checkbox', control: 'checkbox', valueKind: 'checkbox', inspector: ['source', 'checkbox'],
            links: ['source'],
            defaults: {
                value: '', checked: false, uncheckedValue: 0, checkedValue: 1,
                source: '', visibility: 'shown', modifiers: [], children: []
            }
        },
        notes: {
            name: 'Notes', control: 'notes', valueKind: 'input', inspector: ['source'], links: ['source'],
            defaults: { value: '', source: '', visibility: 'shown', modifiers: [], children: [] }
        },
        math: {
            name: 'Math', control: 'math', valueKind: 'math', inspector: ['math'],
            links: ['leftSource', 'rightSource'],
            defaults: {
                value: '', visibility: 'hidden', count: 1, countSource: '', sides: 20,
                sidesSource: '', source: '', modifiers: [], children: [], uncheckedValue: 0,
                checkedValue: 1, keepHighest: 0, keepHighestSource: '', bonusSource: '',
                mathOperation: 'add', mathRounding: 'none', leftValue: 0, leftSource: '',
                rightValue: 0, rightSource: ''
            }
        },
        group: {
            name: 'Group', control: 'group', valueKind: 'group', inspector: ['group'], links: [],
            defaults: { value: '', visibility: 'shown', source: '', modifiers: [], children: [] }
        }
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function flatten(list, output) {
        (list || []).forEach(function (module) {
            output.push(module);
            flatten(module.children, output);
        });
        return output;
    }

    function findModule(list, id) {
        for (var index = 0; index < (list || []).length; index += 1) {
            var module = list[index];
            if (module.id === id) return module;
            var nested = findModule(module.children, id);
            if (nested) return nested;
        }
        return null;
    }

    function findModuleEntry(id, list, parent) {
        var collection = list || state.document.modules;
        for (var index = 0; index < collection.length; index += 1) {
            var module = collection[index];
            if (module.id === id) return { module: module, list: collection, parent: parent || null, index: index };
            var nested = findModuleEntry(id, module.children || [], module);
            if (nested) return nested;
        }
        return null;
    }

    function makeModule(type, id, siblings) {
        var columns = siblings === state.document.modules ? 12 : 6;
        var defaults = clone(moduleTypes[type].defaults);
        var span = Math.min(4, columns);
        var preferred = {
            col: 1 + (siblings.length % 3) * 4,
            row: 1 + Math.floor(siblings.length / 3) * 3
        };
        var placement = findOpenPlacement(siblings, columns, span, 3, preferred);
        return Object.assign({
            id: id,
            type: type,
            name: moduleTypes[type].name,
            col: placement.col,
            row: placement.row,
            colSpan: placement.colSpan,
            rowSpan: placement.rowSpan
        }, defaults);
    }

    /* 3. Grid math */
    function placementsOverlap(first, second) {
        return first.col < second.col + second.colSpan && first.col + first.colSpan > second.col &&
            first.row < second.row + second.rowSpan && first.row + first.rowSpan > second.row;
    }

    function findOpenPlacement(list, columns, colSpan, rowSpan, preferred, ignoreId) {
        var lastRow = Math.max(24, preferred.row + 12);
        list.forEach(function (item) { lastRow = Math.max(lastRow, item.row + item.rowSpan + 8); });
        var best = null;
        var bestDistance = Infinity;
        for (var row = 1; row <= lastRow; row += 1) {
            for (var col = 1; col <= columns - colSpan + 1; col += 1) {
                var candidate = { col: col, row: row, colSpan: colSpan, rowSpan: rowSpan };
                if (list.some(function (item) {
                    return item.id !== ignoreId && placementsOverlap(candidate, item);
                })) continue;
                var distance = Math.abs(col - preferred.col) + Math.abs(row - preferred.row) * 2;
                if (distance < bestDistance) {
                    best = candidate;
                    bestDistance = distance;
                }
            }
        }
        return best || { col: 1, row: lastRow + 1, colSpan: colSpan, rowSpan: rowSpan };
    }

    function nearestPlacement(list, module, columns, preferred) {
        return findOpenPlacement(list, columns, module.colSpan, module.rowSpan, preferred, module.id);
    }

    function snappedPlacement(module, layout, start, x, y, resize) {
        var columns = Number(getComputedStyle(layout).getPropertyValue('--layout-columns').trim()) || 12;
        var bounds = layout.getBoundingClientRect();
        var columnStep = bounds.width / columns;
        var rowStep = parseFloat(getComputedStyle(layout).gridAutoRows) || 64;
        var deltaColumns = Math.round((x - start.x) / columnStep);
        var deltaRows = Math.round((y - start.y) / rowStep);
        if (resize) {
            return Object.assign({}, module, {
                colSpan: Math.max(2, Math.min(columns - module.col + 1, start.colSpan + deltaColumns)),
                rowSpan: Math.max(2, start.rowSpan + deltaRows)
            });
        }
        return Object.assign({}, module, {
            col: Math.max(1, Math.min(columns - module.colSpan + 1, start.col + deltaColumns)),
            row: Math.max(1, start.row + deltaRows)
        });
    }

    /* 4. Value resolving */
    function resolveValue(doc, player, id, visited, mode) {
        var module = findModule(doc.modules, id);
        var seen = visited || {};
        if (!module || module.type === 'group' || seen[id]) return '';
        seen[id] = true;
        var value;
        var playerValue = mode === 'playtest' ? player.values[id] : undefined;
        var checked = mode === 'playtest' ? Boolean(player.checked[id]) : Boolean(module.checked);
        var roll = mode === 'playtest' ? player.rollResults[id] : null;
        var kind = moduleTypes[module.type].valueKind;
        if (kind === 'dice') {
            value = roll ? roll.total : 0;
        } else if (kind === 'math') {
            value = calculateMath(doc, player, module, seen, mode).result;
        } else if (module.source) {
            value = resolveValue(doc, player, module.source, seen, mode);
        } else if (kind === 'number') {
            value = Number(playerValue !== undefined ? playerValue : module.value || 0);
        } else if (kind === 'checkbox') {
            value = Number(checked ? module.checkedValue : module.uncheckedValue);
        } else {
            value = playerValue !== undefined ? playerValue : module.value || '';
        }
        if (kind === 'number') {
            value = Number(value) || 0;
            (module.modifiers || []).forEach(function (modifier) {
                var source = findModule(doc.modules, modifier.source);
                if (source && Boolean(resolveValue(doc, player, source.id, seen, mode))) {
                    value += Number(modifier.amount || 0);
                }
            });
        }
        delete seen[id];
        return value;
    }

    function calculateMath(doc, player, module, visited, mode) {
        var left = module.leftSource ? Number(resolveValue(doc, player, module.leftSource, visited, mode)) : Number(module.leftValue || 0);
        var right = module.rightSource ? Number(resolveValue(doc, player, module.rightSource, visited, mode)) : Number(module.rightValue || 0);
        var result;
        switch (module.mathOperation) {
            case 'subtract': result = left - right; break;
            case 'multiply': result = left * right; break;
            case 'divide':
                result = right === 0 ? NaN : left / right;
                if (module.mathRounding === 'up') result = Math.ceil(result);
                if (module.mathRounding === 'down') result = Math.floor(result);
                break;
            case 'modulo': result = right === 0 ? NaN : left % right; break;
            default: result = left + right;
        }
        return {
            left: left,
            right: right,
            result: result,
            error: (module.mathOperation === 'divide' || module.mathOperation === 'modulo') && right === 0 ?
                'Cannot divide or modulo by zero' : ''
        };
    }

    function diceCount(doc, player, module, mode) {
        var value = module.countSource ? resolveValue(doc, player, module.countSource, {}, mode) : module.count;
        return Math.max(1, Math.min(100, Math.floor(Number(value) || 1)));
    }

    function diceSides(doc, player, module, mode) {
        var value = module.sidesSource ? resolveValue(doc, player, module.sidesSource, {}, mode) : module.sides;
        return Math.max(2, Math.min(1000, Math.floor(Number(value) || 20)));
    }

    function diceKeepHighest(doc, player, module, mode) {
        var count = diceCount(doc, player, module, mode);
        var value = module.keepHighestSource ? resolveValue(doc, player, module.keepHighestSource, {}, mode) : module.keepHighest;
        return Math.max(0, Math.min(count, Math.floor(Number(value) || 0)));
    }

    function diceBonus(doc, player, module, mode) {
        return module.bonusSource ? Number(resolveValue(doc, player, module.bonusSource, {}, mode)) || 0 : 0;
    }

    function diceFormula(module, doc, player, mode) {
        var keep = diceKeepHighest(doc, player, module, mode);
        var formula = diceCount(doc, player, module, mode) + 'd' + diceSides(doc, player, module, mode) + (keep ? 'kh' + keep : '');
        var bonus = diceBonus(doc, player, module, mode);
        return formula + (bonus ? (bonus > 0 ? ' +' : ' ') + bonus : '');
    }

    function helpers() {
        return {
            flatten: function (list) { return flatten(list, []); },
            findModule: findModule,
            resolveValue: function (doc, player, id, visited) {
                return resolveValue(doc, player, id, visited, state.ui.mode);
            },
            calculateMath: function (doc, player, module, visited) {
                return calculateMath(doc, player, module, visited, state.ui.mode);
            },
            diceFormula: function (module, doc, player) {
                return diceFormula(module, doc, player, state.ui.mode);
            }
        };
    }

    function refresh() {
        renderCanvas(studio, state.document, state.ui, state.player, helpers(), moduleTypes);
        renderInspector(studio, state.document, state.ui, helpers(), moduleTypes);
        updatePresetSelection(studio, state.ui);
    }

    function snapshotDocument() {
        return clone(state.document);
    }

    function removeFromDocument(id, doc) {
        var entry = findModuleEntry(id);
        if (!entry) return;
        var removed = {};
        function collect(module) {
            removed[module.id] = true;
            (module.children || []).forEach(collect);
        }
        collect(entry.module);
        entry.list.splice(entry.index, 1);
        flatten(doc.modules, []).forEach(function (module) {
            linkSettings.forEach(function (setting) {
                if (removed[module[setting]]) module[setting] = '';
            });
            module.modifiers = (module.modifiers || []).filter(function (item) { return !removed[item.source]; });
        });
    }

    function clonePresetModules(presetModules, firstId) {
        var copies = clone(presetModules);
        var idMap = {};
        var candidate = firstId;
        flatten(copies, []).forEach(function (module) {
            var oldId = module.id;
            idMap[oldId] = String(candidate);
            module.id = String(candidate);
            candidate += 1;
        });
        flatten(copies, []).forEach(function (module) {
            linkSettings.forEach(function (setting) {
                if (module[setting]) module[setting] = idMap[module[setting]] || '';
            });
            module.modifiers = (module.modifiers || []).filter(function (item) { return idMap[item.source]; })
                .map(function (item) { return { source: idMap[item.source], amount: item.amount }; });
        });
        return { modules: copies, nextId: candidate };
    }

    /* 5. Presets */
    var builtinPresets = {
        'ability-check': [
            { id: 'check', type: 'checkbox', name: 'Proficient', col: 1, row: 1, colSpan: 4, rowSpan: 3, checked: false, checkedValue: 1, uncheckedValue: 0, visibility: 'shown', modifiers: [], children: [] },
            { id: 'modifier', type: 'number', name: 'Ability modifier', col: 5, row: 1, colSpan: 4, rowSpan: 3, value: '0', source: '', visibility: 'shown', modifiers: [{ source: 'check', amount: 2 }], children: [] },
            { id: 'roll', type: 'dice', name: 'Ability check', col: 9, row: 1, colSpan: 4, rowSpan: 3, count: 1, sides: 20, bonusSource: 'modifier', visibility: 'shown', modifiers: [], children: [] }
        ],
        'advantage-attack': [
            { id: 'check', type: 'checkbox', name: 'Proficient', col: 1, row: 1, colSpan: 4, rowSpan: 3, checked: false, checkedValue: 1, uncheckedValue: 0, visibility: 'shown', modifiers: [], children: [] },
            { id: 'modifier', type: 'number', name: 'Attack modifier', col: 5, row: 1, colSpan: 4, rowSpan: 3, value: '0', source: '', visibility: 'shown', modifiers: [{ source: 'check', amount: 2 }], children: [] },
            { id: 'roll', type: 'dice', name: 'Attack roll', col: 9, row: 1, colSpan: 4, rowSpan: 3, count: 2, sides: 20, keepHighest: 1, bonusSource: 'modifier', visibility: 'shown', modifiers: [], children: [] }
        ],
        'ability-score-bonus': [
            { id: 'level', type: 'number', name: 'level', col: 1, row: 1, colSpan: 4, rowSpan: 3, value: '10', visibility: 'shown', modifiers: [], children: [] },
            { id: 'subtract', type: 'math', name: 'subtract 10', col: 5, row: 1, colSpan: 4, rowSpan: 3, leftSource: 'level', rightValue: 10, mathOperation: 'subtract', visibility: 'hidden', modifiers: [], children: [] },
            { id: 'divide', type: 'math', name: 'divide', col: 9, row: 1, colSpan: 4, rowSpan: 3, leftSource: 'subtract', rightValue: 2, mathOperation: 'divide', mathRounding: 'down', visibility: 'hidden', modifiers: [], children: [] },
            { id: 'bonus', type: 'number', name: 'Ability Bonus', col: 1, row: 4, colSpan: 4, rowSpan: 3, source: 'divide', visibility: 'shown', modifiers: [], children: [] }
        ]
    };

    /* 6. Actions */
    function dispatch(action) {
        var documentAction = [
            'add-module', 'remove-modules', 'update-setting', 'update-modifier',
            'add-modifier', 'remove-modifier', 'load-preset', 'save-preset',
            'move-module', 'reparent-module', 'update-document-value', 'update-document-meta', 'restore-document'
        ].includes(action.type);
        if (documentAction && action.recordHistory !== false) {
            state.history.undo.push(snapshotDocument());
            state.history.redo = [];
        }

        switch (action.type) {
            case 'set-mode':
                state.ui.mode = action.mode;
                state.ui.selectedId = null;
                state.ui.selectedModuleIds = [];
                state.ui.activeDrag = null;
                break;
            case 'select':
                state.ui.selectedId = action.id;
                state.ui.selectedModuleIds = action.multi || [];
                break;
            case 'selection':
                state.ui.selectedModuleIds = action.ids;
                break;
            case 'drag-start':
                state.ui.activeDrag = action.drag;
                break;
            case 'drag-update':
                state.ui.activeDrag = Object.assign({}, state.ui.activeDrag, action.values);
                break;
            case 'drag-end':
                state.ui.activeDrag = null;
                break;
            case 'suppress-tool-click':
                state.ui.suppressToolClick = action.value;
                break;
            case 'add-module': {
                var parent = action.parentId ? findModule(state.document.modules, action.parentId) : null;
                if (action.parentId && !parent) break;
                var siblings = parent ? parent.children : state.document.modules;
                var added = makeModule(action.moduleType, String(state.nextModuleId), siblings);
                state.nextModuleId += 1;
                if (action.placement) Object.assign(added, action.placement);
                siblings.push(added);
                state.ui.selectedId = added.id;
                state.ui.selectedModuleIds = [];
                break;
            }
            case 'remove-modules':
                action.ids.forEach(function (id) { removeFromDocument(id, state.document); });
                state.ui.selectedModuleIds = [];
                state.ui.selectedId = null;
                break;
            case 'update-setting': {
                var target = findModule(state.document.modules, action.id);
                if (!target) break;
                target[action.setting] = numericSettings.includes(action.setting) ? Number(action.value) : action.value;
                if (linkSettings.includes(action.setting)) state.player.rollResults[target.id] = null;
                break;
            }
            case 'update-modifier': {
                var modifierModule = findModule(state.document.modules, action.id);
                if (modifierModule && modifierModule.modifiers[action.index]) {
                    modifierModule.modifiers[action.index][action.setting] =
                        action.setting === 'amount' ? Number(action.value) : action.value;
                }
                break;
            }
            case 'add-modifier': {
                var numberModule = findModule(state.document.modules, action.id);
                if (numberModule) {
                    var firstCheckbox = flatten(state.document.modules, []).find(function (item) { return item.type === 'checkbox'; });
                    numberModule.modifiers.push({ source: firstCheckbox ? firstCheckbox.id : '', amount: -1 });
                    state.ui.selectedId = numberModule.id;
                }
                break;
            }
            case 'remove-modifier': {
                var owner = findModule(state.document.modules, action.id);
                if (owner) owner.modifiers.splice(action.index, 1);
                break;
            }
            case 'load-preset': {
                var presetModules = action.modules;
                var cloneResult = clonePresetModules(presetModules, state.nextModuleId);
                var copied = cloneResult.modules;
                state.nextModuleId = cloneResult.nextId;
                var rootColumns = Number(getComputedStyle(rootCanvas).getPropertyValue('--layout-columns').trim()) || 12;
                copied.forEach(function (module) {
                    module.colSpan = Math.min(module.colSpan, rootColumns);
                    var placement = nearestPlacement(state.document.modules, module, rootColumns, { col: module.col, row: module.row });
                    Object.assign(module, placement);
                    state.document.modules.push(module);
                });
                state.ui.selectedId = copied.length ? copied[copied.length - 1].id : null;
                state.ui.selectedModuleIds = [];
                break;
            }
            case 'save-preset': {
                var selectedSet = new Set(state.ui.selectedModuleIds);
                var selected = state.document.modules.filter(function (module) { return selectedSet.has(module.id); });
                state.document.savedPresets.push({
                    name: action.name || 'Preset ' + (state.document.savedPresets.length + 1),
                    modules: clone(selected)
                });
                state.ui.selectedModuleIds = [];
                break;
            }
            case 'move-module': {
                var moving = findModule(state.document.modules, action.id);
                if (moving) {
                    moving.col = action.placement.col;
                    moving.row = action.placement.row;
                    moving.colSpan = action.placement.colSpan;
                    moving.rowSpan = action.placement.rowSpan;
                }
                break;
            }
            case 'reparent-module': {
                var movingEntry = findModuleEntry(action.id);
                var newParent = action.parentId ? findModule(state.document.modules, action.parentId) : null;
                if (!movingEntry || (action.parentId && !newParent)) break;
                movingEntry.list.splice(movingEntry.index, 1);
                var targetList = newParent ? newParent.children : state.document.modules;
                var columns = newParent ? 6 : (Number(getComputedStyle(rootCanvas).getPropertyValue('--layout-columns').trim()) || 12);
                var movingModule = movingEntry.module;
                movingModule.colSpan = Math.min(movingModule.colSpan, newParent ? columns : 4);
                Object.assign(movingModule, nearestPlacement(targetList, movingModule, columns, action.preferred || { col: 1, row: 1 }));
                targetList.push(movingModule);
                break;
            }
            case 'update-document-value': {
                var documentModule = findModule(state.document.modules, action.id);
                if (documentModule) documentModule.value = action.value;
                break;
            }
            case 'update-document-meta':
                state.document[action.key] = action.value;
                break;
            case 'player-value':
                state.player.values[action.id] = action.value;
                break;
            case 'player-checked':
                state.player.checked[action.id] = action.value;
                break;
            case 'player-roll':
                state.player.rollResults[action.id] = action.result;
                break;
            case 'undo':
                if (state.history.undo.length) {
                    state.history.redo.push(snapshotDocument());
                    state.document = state.history.undo.pop();
                }
                break;
            case 'redo':
                if (state.history.redo.length) {
                    state.history.undo.push(snapshotDocument());
                    state.document = state.history.redo.pop();
                }
                break;
            case 'restore-document':
                state.document = Object.assign({ savedPresets: [] }, action.document);
                state.nextModuleId = flatten(state.document.modules, []).reduce(function (next, module) {
                    var numericId = Number(module.id);
                    return Number.isFinite(numericId) ? Math.max(next, numericId + 1) : next;
                }, 1);
                state.ui.selectedId = null;
                state.ui.selectedModuleIds = [];
                break;
            case 'update-selection':
                state.ui.selectedModuleIds = action.ids;
                break;
            default:
                return;
        }

        if (documentAction || action.type === 'undo' || action.type === 'redo') {
            try {
                autosave(state.document);
            } catch (error) {
                console.error('Template builder autosave failed:', error);
            }
        }
        if (action.render !== false) {
            refresh();
            if (action.type === 'save-preset' || action.type === 'load-preset') {
                renderSavedPresets(studio, state.document.savedPresets);
            }
        }
    }

    /* 7. Interactions */
    function canvasForPoint(x, y) {
        var target = document.elementFromPoint(x, y);
        var groupCanvas = target && target.closest('[data-group-canvas]');
        if (groupCanvas) return { element: groupCanvas, owner: findModule(state.document.modules, groupCanvas.dataset.groupCanvas) };
        return target && rootCanvas.contains(target) ? { element: rootCanvas, owner: null } : null;
    }

    function containsModule(module, id) {
        return (module.children || []).some(function (child) {
            return child.id === id || containsModule(child, id);
        });
    }

    function deleteSelected() {
        if (state.ui.mode !== 'developer') return;
        var ids = state.ui.selectedModuleIds.slice();
        if (!ids.length && state.ui.selectedId && findModule(state.document.modules, state.ui.selectedId)) {
            ids.push(state.ui.selectedId);
        }
        if (!ids.length) return;
        if (!window.confirm(ids.length === 1 ? 'Do you want to delete the selected module?' : 'Do you want to delete the selected modules?')) return;
        dispatch({ type: 'remove-modules', ids: ids });
    }

    function startPointer(event) {
        var target = event.target;
        var tool = target.closest('[data-module-tool]');
        if (tool && state.ui.mode === 'developer') {
            dispatch({ type: 'drag-start', drag: {
                kind: 'palette', pointerId: event.pointerId, type: tool.dataset.moduleTool,
                tool: tool, startX: event.clientX, startY: event.clientY, dragged: false
            }, render: false });
            tool.setPointerCapture(event.pointerId);
            return;
        }
        if (state.ui.mode === 'developer' && rootCanvas.contains(target) && !target.closest('[data-sheet-module]')) {
            var marquee = document.createElement('div');
            marquee.className = 'module-selection-marquee';
            rootCanvas.appendChild(marquee);
            dispatch({ type: 'select', id: null, multi: [] , render: false });
            dispatch({ type: 'drag-start', drag: {
                kind: 'selection', pointerId: event.pointerId, startX: event.clientX,
                startY: event.clientY, marquee: marquee
            }, render: false });
            rootCanvas.setPointerCapture(event.pointerId);
            rootCanvas.focus();
            refresh();
            event.preventDefault();
            return;
        }
        var move = target.closest('[data-move-module]');
        var resize = target.closest('[data-resize-module]');
        if ((!move && !resize) || state.ui.mode !== 'developer') return;
        var card = target.closest('[data-sheet-module]');
        var module = findModule(state.document.modules, card.dataset.sheetModule);
        var layout = card.parentElement.closest('[data-layout-canvas]');
        (move || resize).setPointerCapture(event.pointerId);
        dispatch({ type: 'drag-start', drag: {
            kind: 'module', pointerId: event.pointerId, id: module.id, element: card,
            layout: layout, resize: Boolean(resize),
            start: { x: event.clientX, y: event.clientY, col: module.col, row: module.row, colSpan: module.colSpan, rowSpan: module.rowSpan },
            placement: { col: module.col, row: module.row, colSpan: module.colSpan, rowSpan: module.rowSpan }
        }, render: false });
        event.preventDefault();
    }

    function movePointer(event) {
        var drag = state.ui.activeDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.kind === 'palette') {
            var dragged = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
            if (dragged) {
                drag.tool.classList.add('is-dragging');
                event.preventDefault();
            }
            dispatch({ type: 'drag-update', values: { dragged: dragged || drag.dragged }, render: false });
            return;
        }
        if (drag.kind === 'selection') {
            var bounds = {
                left: Math.min(drag.startX, event.clientX), right: Math.max(drag.startX, event.clientX),
                top: Math.min(drag.startY, event.clientY), bottom: Math.max(drag.startY, event.clientY)
            };
            var canvasBounds = rootCanvas.getBoundingClientRect();
            drag.marquee.style.left = bounds.left - canvasBounds.left + rootCanvas.scrollLeft + 'px';
            drag.marquee.style.top = bounds.top - canvasBounds.top + rootCanvas.scrollTop + 'px';
            drag.marquee.style.width = bounds.right - bounds.left + 'px';
            drag.marquee.style.height = bounds.bottom - bounds.top + 'px';
            var selected = Array.prototype.filter.call(rootCanvas.children, function (element) {
                if (!element.matches('[data-sheet-module]')) return false;
                var rect = element.getBoundingClientRect();
                return rect.left < bounds.right && rect.right > bounds.left && rect.top < bounds.bottom && rect.bottom > bounds.top;
            }).map(function (element) { return element.dataset.sheetModule; });
            dispatch({ type: 'selection', ids: selected, render: false });
            updatePresetSelection(studio, state.ui);
            event.preventDefault();
            return;
        }

        var module = findModule(state.document.modules, drag.id);
        var preview = snappedPlacement(module, drag.layout, drag.start, event.clientX, event.clientY, drag.resize);
        var entry = findModuleEntry(drag.id);
        if (entry && entry.list.some(function (item) { return item.id !== module.id && placementsOverlap(preview, item); })) return;
        dispatch({ type: 'drag-update', values: {
            placement: { col: preview.col, row: preview.row, colSpan: preview.colSpan, rowSpan: preview.rowSpan }
        }, render: false });
        preview.element = drag.element;
        var columns = Number(getComputedStyle(drag.layout).getPropertyValue('--layout-columns').trim()) || 12;
        preview.style = drag.element.style;
        preview.style.gridColumn = Math.max(1, Math.min(columns - preview.colSpan + 1, preview.col)) + ' / span ' + Math.min(preview.colSpan, columns);
        preview.style.gridRow = preview.row + ' / span ' + preview.rowSpan;
    }

    function finishPointer(event, cancelled) {
        var drag = state.ui.activeDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dispatch({ type: 'drag-end', render: false });
        if (drag.kind === 'palette') {
            drag.tool.classList.remove('is-dragging');
            if (!cancelled && drag.dragged) {
                dispatch({ type: 'suppress-tool-click', value: true, render: false });
                window.setTimeout(function () { dispatch({ type: 'suppress-tool-click', value: false, render: false }); }, 50);
                var destination = canvasForPoint(event.clientX, event.clientY);
                if (destination) {
                    var columns = Number(getComputedStyle(destination.element).getPropertyValue('--layout-columns').trim()) || 12;
                    var siblings = destination.owner ? destination.owner.children : state.document.modules;
                    var module = makeModule(drag.type, 'pending', siblings);
                    var rect = destination.element.getBoundingClientRect();
                    var rowStep = parseFloat(getComputedStyle(destination.element).gridAutoRows) || 64;
                    var placement = nearestPlacement(siblings, module, columns, {
                        col: Math.max(1, Math.min(columns - module.colSpan + 1, Math.floor((event.clientX - rect.left) / (rect.width / columns)) + 1)),
                        row: Math.max(1, Math.floor((event.clientY - rect.top) / rowStep) + 1)
                    });
                    dispatch({ type: 'add-module', moduleType: drag.type, parentId: destination.owner && destination.owner.id, placement: placement });
                }
            } else {
                refresh();
            }
            return;
        }
        if (drag.kind === 'selection') {
            drag.marquee.remove();
            updatePresetSelection(studio, state.ui);
            return;
        }
        if (cancelled) {
            refresh();
            return;
        }
        var drop = canvasForPoint(event.clientX, event.clientY);
        var module = findModule(state.document.modules, drag.id);
        var entry = findModuleEntry(drag.id);
        if (drop && drop.owner && containsModule(module, drop.owner.id)) {
            refresh();
            return;
        }
        if (drop && drop.owner && drop.owner.id !== drag.id && entry && entry.parent !== drop.owner) {
            dispatch({ type: 'reparent-module', id: drag.id, parentId: drop.owner.id, preferred: { col: 1, row: 1 } });
        } else if (drop && !drop.owner && entry && entry.parent) {
            dispatch({ type: 'reparent-module', id: drag.id, parentId: null, preferred: { col: 1, row: 1 } });
        } else {
            dispatch({ type: 'move-module', id: drag.id, placement: drag.placement });
        }
    }

    function rollDice(module) {
        var count = diceCount(state.document, state.player, module, state.ui.mode);
        var sides = diceSides(state.document, state.player, module, state.ui.mode);
        var keep = diceKeepHighest(state.document, state.player, module, state.ui.mode);
        var rolls = [];
        for (var index = 0; index < count; index += 1) rolls.push(Math.floor(Math.random() * sides) + 1);
        var kept = keep ? rolls.slice().sort(function (a, b) { return b - a; }).slice(0, keep) : rolls.slice();
        var bonus = diceBonus(state.document, state.player, module, state.ui.mode);
        dispatch({
            type: 'player-roll',
            id: module.id,
            result: {
                rolls: rolls,
                kept: kept,
                keepHighest: keep,
                bonus: bonus,
                total: kept.reduce(function (sum, roll) { return sum + roll; }, 0) + bonus
            }
        });
    }

    function handleClick(event) {
        var target = event.target;
        var view = target.closest('[data-view-button]');
        if (view) {
            dispatch({ type: 'set-mode', mode: view.dataset.viewButton });
            studio.dataset.mode = state.ui.mode;
            studio.querySelectorAll('[data-view-button]').forEach(function (button) {
                button.setAttribute('aria-selected', String(button === view));
            });
            studio.querySelector('[data-workspace-title]').textContent = state.ui.mode === 'developer' ?
                'Developer canvas' : (state.document.name || 'Character sheet');
            studio.querySelector('[data-workspace-help]').textContent = state.ui.mode === 'developer' ?
                'Snap modules into the grid. Drag modules into a group to keep related fields together.' :
                'Enter values, toggle conditions, and roll dice to test the sheet.';
            return;
        }
        var preset = target.closest('[data-load-preset]');
        if (preset && state.ui.mode === 'developer') {
            dispatch({ type: 'load-preset', modules: builtinPresets[preset.dataset.loadPreset] });
            return;
        }
        var savedPreset = target.closest('[data-saved-preset]');
        if (savedPreset && state.ui.mode === 'developer') {
            var saved = state.document.savedPresets[Number(savedPreset.dataset.savedPreset)];
            if (saved) dispatch({ type: 'load-preset', modules: saved.modules });
            return;
        }
        if (target.closest('[data-save-preset]') && state.ui.selectedModuleIds.length) {
            var name = studio.querySelector('#preset-name').value.trim();
            dispatch({ type: 'save-preset', name: name });
            studio.querySelector('#preset-name').value = '';
            return;
        }
        var tool = target.closest('[data-module-tool]');
        if (tool && state.ui.mode === 'developer') {
            if (!state.ui.suppressToolClick) dispatch({ type: 'add-module', moduleType: tool.dataset.moduleTool });
            return;
        }
        var remove = target.closest('[data-remove-module]');
        if (remove && state.ui.mode === 'developer') {
            dispatch({ type: 'remove-modules', ids: [remove.dataset.removeModule] });
            return;
        }
        var edit = target.closest('[data-edit-module]');
        if (edit && state.ui.mode === 'developer') {
            dispatch({ type: 'select', id: edit.dataset.editModule, multi: [] });
            return;
        }
        var addModifier = target.closest('[data-add-modifier]');
        if (addModifier) {
            dispatch({ type: 'add-modifier', id: addModifier.dataset.addModifier });
            return;
        }
        var removeModifier = target.closest('[data-remove-modifier]');
        if (removeModifier) {
            var row = removeModifier.closest('[data-modifier-index]');
            dispatch({ type: 'remove-modifier', id: row.dataset.moduleId, index: Number(row.dataset.modifierIndex) });
            return;
        }
        var roll = target.closest('[data-roll-module]');
        if (roll) {
            var dice = findModule(state.document.modules, roll.dataset.rollModule);
            if (dice) rollDice(dice);
        }
    }

    function handleInputs(event) {
        var target = event.target;
        var valueInput = target.closest('[data-module-value]');
        if (valueInput && event.type === 'input') {
            var id = valueInput.dataset.moduleValue;
            dispatch(state.ui.mode === 'playtest' ?
                { type: 'player-value', id: id, value: valueInput.value, render: false } :
                { type: 'update-document-value', id: id, value: valueInput.value, render: false });
            updateLiveValues(studio, state.document, state.ui, state.player, helpers());
            return;
        }
        if (event.type === 'change') {
            var checkbox = target.closest('[data-module-checked]');
            if (checkbox) {
                if (state.ui.mode === 'playtest') dispatch({ type: 'player-checked', id: checkbox.dataset.moduleChecked, value: checkbox.checked });
                else {
                    var checkboxModule = findModule(state.document.modules, checkbox.dataset.moduleChecked);
                    if (checkboxModule) dispatch({ type: 'update-setting', id: checkboxModule.id, setting: 'checked', value: checkbox.checked });
                }
                return;
            }
        }
        var isSelect = target.tagName === 'SELECT';
        var setting = target.dataset.setting;
        if (setting && state.ui.mode === 'developer' && ((event.type === 'input' && !isSelect) || (event.type === 'change' && isSelect))) {
            var selected = findModule(state.document.modules, state.ui.selectedId);
            if (selected) {
                var inPlace = setting === 'name' || numericSettings.includes(setting);
                dispatch({ type: 'update-setting', id: selected.id, setting: setting, value: target.value, render: !inPlace });
                if (inPlace) {
                    if (setting === 'name') {
                        var title = studio.querySelector('[data-sheet-module="' + selected.id + '"] [data-module-title]');
                        if (title) title.textContent = target.value || moduleTypes[selected.type].name;
                    } else {
                        updateLiveValues(studio, state.document, state.ui, state.player, helpers());
                    }
                }
            }
            return;
        }
        var modifierSetting = target.dataset.modifierSetting;
        if (modifierSetting && ((event.type === 'input' && !isSelect) || (event.type === 'change' && isSelect))) {
            var row = target.closest('[data-modifier-index]');
            dispatch({
                type: 'update-modifier', id: row.dataset.moduleId,
                index: Number(row.dataset.modifierIndex), setting: modifierSetting, value: target.value,
                recordHistory: true
            });
        }
    }

    async function saveAction(kind) {
        var url = kind === 'draft' ? studio.dataset.saveDraftUrl : studio.dataset.publishUrl;
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        var token = studio.dataset.csrfToken || (csrfMeta && csrfMeta.content);
        try {
            if (kind === 'publish') {
                var problems = validate(state.document);
                if (problems.length) {
                    window.alert(problems.join('\n'));
                    return;
                }
                await publish(state.document, url, token);
            } else {
                await saveDraft(state.document, url, token);
            }
        } catch (error) {
            console.error('Template builder ' + kind + ' failed:', error);
            window.alert('todo');
        }
    }

    function downloadTemplate() {
        var blob = new Blob([downloadJson(state.document)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = (state.document.name || 'template').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    function handleKeydown(event) {
        var command = event.ctrlKey || event.metaKey;
        var editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
        if (command && !editing && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
            return;
        }
        if ((event.key === 'Backspace' || event.key === 'Delete') && state.ui.mode === 'developer' && !editing) {
            event.preventDefault();
            deleteSelected();
        }
    }

    /* 8. Startup */
    function attachListeners() {
        studio.addEventListener('pointerdown', startPointer);
        studio.addEventListener('pointermove', movePointer);
        studio.addEventListener('pointerup', function (event) { finishPointer(event, false); });
        studio.addEventListener('pointercancel', function (event) { finishPointer(event, true); });
        studio.addEventListener('keydown', handleKeydown);
        studio.addEventListener('click', handleClick);
        studio.addEventListener('input', handleInputs);
        studio.addEventListener('change', handleInputs);
        studio.querySelector('#sheet-name').addEventListener('input', function (event) {
            dispatch({ type: 'update-document-meta', key: 'name', value: event.target.value, render: false });
            if (state.ui.mode === 'playtest') {
                studio.querySelector('[data-workspace-title]').textContent = event.target.value || 'Character sheet';
            }
        });
        studio.querySelector('#sheet-description').addEventListener('input', function (event) {
            dispatch({ type: 'update-document-meta', key: 'description', value: event.target.value, render: false });
        });
        studio.querySelector('[data-download-template]').addEventListener('click', downloadTemplate);
        studio.querySelector('[data-save-draft]').addEventListener('click', function () { saveAction('draft'); });
        studio.querySelector('[data-publish-template]').addEventListener('click', function () { saveAction('publish'); });
    }

    try {
        var saved = restore();
        if (saved && Array.isArray(saved.modules)) {
            dispatch({ type: 'restore-document', document: saved, recordHistory: false, render: false });
            studio.querySelector('#sheet-name').value = state.document.name || '';
            studio.querySelector('#sheet-description').value = state.document.description || '';
        }
    } catch (error) {
        console.error('Template builder draft restore failed:', error);
        window.alert('The saved draft could not be restored.');
    }
    studio.dataset.saveDraftUrl = studio.dataset.saveDraftUrl || '/template-builder/save-draft';
    studio.dataset.publishUrl = studio.dataset.publishUrl || '/template-builder/publish';
    attachListeners();
    renderSavedPresets(studio, state.document.savedPresets);
    refresh();
}
