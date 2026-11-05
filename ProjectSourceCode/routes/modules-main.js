// handles clicks and keeps track of the sheet, it uses the other modules to build and save it.
import { autosave, downloadJson, restore, save, validate } from './modules-database.js';
import {
    renderCanvas,
    renderInspector,
    renderSavedPresets,
    setPlacement,
    updateLiveValues,
    updatePresetSelection
} from './modules-render.js';
import { builtinPresets, clonePresetModules, moduleSize, moduleTypes } from './modules-config.js';
import { clone, findModule, flatten, layoutColumns, linkSettings } from './modules-helper.js';

/* sheet state */
var studio = document.querySelector('[data-sheet-studio]');
if (studio) {
    var rootCanvas = studio.querySelector('[data-root-canvas]');
    var numericSettings = [
        'value', 'count', 'sides', 'uncheckedValue', 'checkedValue',
        'keepHighest', 'leftValue', 'rightValue'
    ];
    // sheet changes can be undone and are saved as you work.
    var documentActions = [
        'add-module', 'remove-modules', 'update-setting', 'update-modifier',
        'add-modifier', 'remove-modifier', 'load-preset', 'save-preset', 'move-module',
        'reparent-module', 'update-document-value', 'update-document-meta', 'restore-document'
    ];

    // keep the sheet, editor choices, and playtest values separate.
    var state = {
        document: { name: '', description: '', modules: [], savedPresets: [] },
        ui: { mode: 'developer', selectedId: null, selectedModuleIds: [], activeDrag: null, suppressToolClick: false },
        player: { values: {}, checked: {}, rollResults: {} },
        history: { undo: [], redo: [] },
        nextModuleId: 1
    };

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
        var preferred = { col: 1 + (siblings.length % 3) * 4, row: 1 + Math.floor(siblings.length / 3) * 3 };
        return Object.assign(
            { id: id, type: type, name: moduleTypes[type].name },
            findOpenPlacement(siblings, columns, moduleSize.colSpan, moduleSize.rowSpan, preferred),
            clone(moduleTypes[type].defaults)
        );
    }

    /* grid placement */
    // find open spots and snap dragged modules to the grid.
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
                if (list.some(function (item) { return item.id !== ignoreId && placementsOverlap(candidate, item); })) continue;
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
        var columns = layoutColumns(layout);
        var columnsMoved = Math.round((x - start.x) / (layout.getBoundingClientRect().width / columns));
        var rowsMoved = Math.round((y - start.y) / (parseFloat(getComputedStyle(layout).gridAutoRows) || 64));
        if (resize) {
            return Object.assign({}, module, {
                colSpan: Math.max(2, Math.min(columns - module.col + 1, start.colSpan + columnsMoved)),
                rowSpan: Math.max(2, start.rowSpan + rowsMoved)
            });
        }
        return Object.assign({}, module, {
            col: Math.max(1, Math.min(columns - module.colSpan + 1, start.col + columnsMoved)),
            row: Math.max(1, start.row + rowsMoved)
        });
    }

    /* values and rolls */
    // use the sheet values in both edit mode and playtest without changing the sheet.
    var mathOperations = {
        add: function (a, b) { return a + b; },
        subtract: function (a, b) { return a - b; },
        multiply: function (a, b) { return a * b; },
        divide: function (a, b) { return b === 0 ? NaN : a / b; },
        modulo: function (a, b) { return b === 0 ? NaN : a % b; }
    };

    function resolveValue(id, seen) {
        var module = findModule(state.document.modules, id);
        seen = seen || {};
        if (!module || module.type === 'group' || seen[id]) return '';
        seen[id] = true;
        var playtest = state.ui.mode === 'playtest';
        var typed = playtest ? state.player.values[id] : undefined;
        var kind = moduleTypes[module.type].valueKind;
        var value;
        if (kind === 'dice') {
            var roll = playtest ? state.player.rollResults[id] : null;
            value = roll ? roll.total : 0;
        } else if (kind === 'math') {
            value = calculateMath(module, seen).result;
        } else if (module.source) {
            value = resolveValue(module.source, seen);
        } else if (kind === 'number') {
            value = typed !== undefined ? typed : module.value || 0;
        } else if (kind === 'checkbox') {
            var checked = playtest ? state.player.checked[id] : module.checked;
            value = Number(checked ? module.checkedValue : module.uncheckedValue);
        } else {
            value = typed !== undefined ? typed : module.value || '';
        }
        if (kind === 'number') {
            value = Number(value) || 0;
            (module.modifiers || []).forEach(function (modifier) {
                if (resolveValue(modifier.source, seen)) value += Number(modifier.amount || 0);
            });
        }
        delete seen[id];
        return value;
    }

    function calculateMath(module, seen) {
        function side(name) {
            var source = module[name + 'Source'];
            return Number(source ? resolveValue(source, seen) : module[name + 'Value'] || 0);
        }
        var left = side('left');
        var right = side('right');
        var result = (mathOperations[module.mathOperation] || mathOperations.add)(left, right);
        if (module.mathOperation === 'divide' && module.mathRounding === 'up') result = Math.ceil(result);
        if (module.mathOperation === 'divide' && module.mathRounding === 'down') result = Math.floor(result);
        var zeroError = Number.isNaN(result) && right === 0;
        return { left: left, right: right, result: result, error: zeroError ? 'Cannot divide or modulo by zero' : '' };
    }

    // use a linked module for a dice setting when one is selected.
    function diceSetting(module, name, fallback, min, max) {
        var source = module[name + 'Source'];
        var value = source ? resolveValue(source) : module[name];
        return Math.max(min, Math.min(max, Math.floor(Number(value) || fallback)));
    }

    function diceStats(module) {
        var count = diceSetting(module, 'count', 1, 1, 100);
        return {
            count: count,
            sides: diceSetting(module, 'sides', 20, 2, 1000),
            keep: diceSetting(module, 'keepHighest', 0, 0, count),
            bonus: module.bonusSource ? Number(resolveValue(module.bonusSource)) || 0 : 0
        };
    }

    function diceFormula(module) {
        var dice = diceStats(module);
        var formula = dice.count + 'd' + dice.sides + (dice.keep ? 'kh' + dice.keep : '');
        return formula + (dice.bonus ? (dice.bonus > 0 ? ' +' : ' ') + dice.bonus : '');
    }

    // give the render file the values it needs to draw the sheet.
    var api = {
        types: moduleTypes,
        resolveValue: resolveValue,
        calculateMath: calculateMath,
        diceFormula: diceFormula
    };

    function refresh() {
        renderCanvas(studio, state, api);
        renderInspector(studio, state, api);
        updatePresetSelection(studio, state.ui);
    }

    /* sheet actions */
    // update the sheet here so edits, undo, and autosave stay in sync.
    function setUi(values, render) {
        dispatch({ type: 'ui', values: values, render: render });
    }

    function choose(id, ids) {
        state.ui.selectedId = id;
        state.ui.selectedModuleIds = ids || [];
    }

    function dispatch(action) {
        var edits = documentActions.includes(action.type);
        if (edits && action.recordHistory !== false) {
            state.history.undo.push(clone(state.document));
            state.history.redo = [];
        }

        switch (action.type) {
            case 'ui':
                Object.assign(state.ui, action.values);
                break;
            case 'player':
                state.player[action.key][action.id] = action.value;
                break;
            case 'add-module': {
                var parent = action.parentId ? findModule(state.document.modules, action.parentId) : null;
                if (action.parentId && !parent) break;
                var siblings = parent ? parent.children : state.document.modules;
                var added = Object.assign(makeModule(action.moduleType, String(state.nextModuleId), siblings), action.placement);
                state.nextModuleId += 1;
                siblings.push(added);
                choose(added.id);
                break;
            }
            case 'remove-modules': {
                var removed = {};
                action.ids.forEach(function (id) {
                    var entry = findModuleEntry(id);
                    if (!entry) return;
                    flatten([entry.module]).forEach(function (module) { removed[module.id] = true; });
                    entry.list.splice(entry.index, 1);
                });
                flatten(state.document.modules).forEach(function (module) {
                    linkSettings.forEach(function (setting) {
                        if (removed[module[setting]]) module[setting] = '';
                    });
                    module.modifiers = (module.modifiers || []).filter(function (item) { return !removed[item.source]; });
                });
                choose(null);
                break;
            }
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
                if (!numberModule) break;
                var firstCheckbox = flatten(state.document.modules).find(function (item) { return item.type === 'checkbox'; });
                numberModule.modifiers.push({ source: firstCheckbox ? firstCheckbox.id : '', amount: -1 });
                state.ui.selectedId = numberModule.id;
                break;
            }
            case 'remove-modifier': {
                var owner = findModule(state.document.modules, action.id);
                if (owner) owner.modifiers.splice(action.index, 1);
                break;
            }
            case 'load-preset': {
                var loaded = clonePresetModules(action.modules, state.nextModuleId);
                var rootColumns = layoutColumns(rootCanvas);
                state.nextModuleId = loaded.nextId;
                loaded.modules.forEach(function (module) {
                    module.colSpan = Math.min(module.colSpan, rootColumns);
                    Object.assign(module, nearestPlacement(state.document.modules, module, rootColumns, module));
                    state.document.modules.push(module);
                });
                choose(loaded.modules.length ? loaded.modules[loaded.modules.length - 1].id : null);
                break;
            }
            case 'save-preset': {
                var selected = state.document.modules.filter(function (module) {
                    return state.ui.selectedModuleIds.includes(module.id);
                });
                state.document.savedPresets.push({
                    name: action.name || 'Preset ' + (state.document.savedPresets.length + 1),
                    modules: clone(selected)
                });
                state.ui.selectedModuleIds = [];
                break;
            }
            case 'move-module': {
                var moving = findModule(state.document.modules, action.id);
                if (moving) Object.assign(moving, action.placement);
                break;
            }
            case 'reparent-module': {
                var movingEntry = findModuleEntry(action.id);
                var newParent = action.parentId ? findModule(state.document.modules, action.parentId) : null;
                if (!movingEntry || (action.parentId && !newParent)) break;
                var targetList = newParent ? newParent.children : state.document.modules;
                var columns = newParent ? 6 : layoutColumns(rootCanvas);
                movingEntry.list.splice(movingEntry.index, 1);
                movingEntry.module.colSpan = Math.min(movingEntry.module.colSpan, newParent ? columns : moduleSize.colSpan);
                Object.assign(movingEntry.module, nearestPlacement(targetList, movingEntry.module, columns, { col: 1, row: 1 }));
                targetList.push(movingEntry.module);
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
            case 'undo':
            case 'redo': {
                var from = action.type === 'undo' ? state.history.undo : state.history.redo;
                var to = action.type === 'undo' ? state.history.redo : state.history.undo;
                if (from.length) {
                    to.push(clone(state.document));
                    state.document = from.pop();
                }
                break;
            }
            case 'restore-document':
                state.document = Object.assign({ savedPresets: [] }, action.document);
                state.nextModuleId = flatten(state.document.modules).reduce(function (next, module) {
                    var numericId = Number(module.id);
                    return Number.isFinite(numericId) ? Math.max(next, numericId + 1) : next;
                }, 1);
                choose(null);
                break;
            default:
                return;
        }

        if (edits || action.type === 'undo' || action.type === 'redo') {
            try {
                autosave(state.document);
            } catch (error) {
                console.error('Template builder autosave failed:', error);
            }
        }
        if (action.render === false) return;
        refresh();
        if (action.type === 'save-preset' || action.type === 'load-preset') {
            renderSavedPresets(studio, state.document.savedPresets);
        }
    }

    /* page interactions */
    // turn clicks, typing, and dragging into sheet actions.
    function canvasForPoint(x, y) {
        var target = document.elementFromPoint(x, y);
        var groupCanvas = target && target.closest('[data-group-canvas]');
        if (groupCanvas) {
            return { element: groupCanvas, owner: findModule(state.document.modules, groupCanvas.dataset.groupCanvas) };
        }
        return target && rootCanvas.contains(target) ? { element: rootCanvas, owner: null } : null;
    }

    function containsModule(module, id) {
        return flatten(module.children).some(function (child) { return child.id === id; });
    }

    function deleteSelected() {
        var ids = state.ui.selectedModuleIds.slice();
        if (!ids.length && findModule(state.document.modules, state.ui.selectedId)) ids.push(state.ui.selectedId);
        if (!ids.length) return;
        if (!window.confirm(ids.length === 1 ? 'Do you want to delete the selected module?' : 'Do you want to delete the selected modules?')) return;
        dispatch({ type: 'remove-modules', ids: ids });
    }

    function startPointer(event) {
        if (state.ui.mode !== 'developer') return;
        var target = event.target;
        var tool = target.closest('[data-module-tool]');
        if (tool) {
            setUi({ activeDrag: {
                kind: 'palette', pointerId: event.pointerId, type: tool.dataset.moduleTool,
                tool: tool, startX: event.clientX, startY: event.clientY, dragged: false
            } }, false);
            tool.setPointerCapture(event.pointerId);
            return;
        }
        if (rootCanvas.contains(target) && !target.closest('[data-sheet-module]')) {
            var marquee = document.createElement('div');
            marquee.className = 'module-selection-marquee';
            rootCanvas.appendChild(marquee);
            setUi({
                selectedId: null,
                selectedModuleIds: [],
                activeDrag: { kind: 'selection', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, marquee: marquee }
            }, false);
            rootCanvas.setPointerCapture(event.pointerId);
            rootCanvas.focus();
            refresh();
            event.preventDefault();
            return;
        }
        var resize = target.closest('[data-resize-module]');
        var handle = resize || target.closest('[data-move-module]');
        if (!handle) return;
        var card = target.closest('[data-sheet-module]');
        var module = findModule(state.document.modules, card.dataset.sheetModule);
        var placement = { col: module.col, row: module.row, colSpan: module.colSpan, rowSpan: module.rowSpan };
        handle.setPointerCapture(event.pointerId);
        setUi({ activeDrag: {
            kind: 'module', pointerId: event.pointerId, id: module.id, element: card,
            layout: card.parentElement.closest('[data-layout-canvas]'), resize: Boolean(resize),
            start: Object.assign({ x: event.clientX, y: event.clientY }, placement),
            placement: placement
        } }, false);
        event.preventDefault();
    }

    // update the dragged module as the pointer moves; save its new spot when dragging ends.
    function movePointer(event) {
        var drag = state.ui.activeDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.kind === 'palette') {
            var far = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
            if (far) {
                drag.tool.classList.add('is-dragging');
                event.preventDefault();
            }
            drag.dragged = far || drag.dragged;
            return;
        }
        if (drag.kind === 'selection') {
            var box = {
                left: Math.min(drag.startX, event.clientX), right: Math.max(drag.startX, event.clientX),
                top: Math.min(drag.startY, event.clientY), bottom: Math.max(drag.startY, event.clientY)
            };
            var canvasBounds = rootCanvas.getBoundingClientRect();
            Object.assign(drag.marquee.style, {
                left: box.left - canvasBounds.left + rootCanvas.scrollLeft + 'px',
                top: box.top - canvasBounds.top + rootCanvas.scrollTop + 'px',
                width: box.right - box.left + 'px',
                height: box.bottom - box.top + 'px'
            });
            var ids = Array.prototype.filter.call(rootCanvas.children, function (element) {
                if (!element.matches('[data-sheet-module]')) return false;
                var rect = element.getBoundingClientRect();
                return rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
            }).map(function (element) { return element.dataset.sheetModule; });
            setUi({ selectedModuleIds: ids }, false);
            updatePresetSelection(studio, state.ui);
            event.preventDefault();
            return;
        }

        var module = findModule(state.document.modules, drag.id);
        var preview = snappedPlacement(module, drag.layout, drag.start, event.clientX, event.clientY, drag.resize);
        var entry = findModuleEntry(drag.id);
        if (entry.list.some(function (item) { return item.id !== module.id && placementsOverlap(preview, item); })) return;
        drag.placement = { col: preview.col, row: preview.row, colSpan: preview.colSpan, rowSpan: preview.rowSpan };
        setPlacement(drag.element, preview, drag.layout);
    }

    function dropTool(drag, event) {
        setUi({ suppressToolClick: true }, false);
        window.setTimeout(function () { setUi({ suppressToolClick: false }, false); }, 50);
        var destination = canvasForPoint(event.clientX, event.clientY);
        if (!destination) return;
        var columns = layoutColumns(destination.element);
        var siblings = destination.owner ? destination.owner.children : state.document.modules;
        var rect = destination.element.getBoundingClientRect();
        var rowStep = parseFloat(getComputedStyle(destination.element).gridAutoRows) || 64;
        var placement = nearestPlacement(siblings, moduleSize, columns, {
            col: Math.max(1, Math.min(columns - moduleSize.colSpan + 1, Math.floor((event.clientX - rect.left) / (rect.width / columns)) + 1)),
            row: Math.max(1, Math.floor((event.clientY - rect.top) / rowStep) + 1)
        });
        dispatch({ type: 'add-module', moduleType: drag.type, parentId: destination.owner && destination.owner.id, placement: placement });
    }

    function dropModule(drag, event) {
        var drop = canvasForPoint(event.clientX, event.clientY);
        var entry = findModuleEntry(drag.id);
        // keep the module where it is if it is dropped outside a canvas or on itself.
        var owner = drop ? drop.owner : entry.parent;
        if (owner && owner.id === drag.id) owner = entry.parent;
        if (owner && containsModule(entry.module, owner.id)) {
            refresh();
            return;
        }
        if (owner === entry.parent) dispatch({ type: 'move-module', id: drag.id, placement: drag.placement });
        else dispatch({ type: 'reparent-module', id: drag.id, parentId: owner && owner.id });
    }

    function finishPointer(event, cancelled) {
        var drag = state.ui.activeDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setUi({ activeDrag: null }, false);
        if (drag.kind === 'selection') {
            drag.marquee.remove();
            updatePresetSelection(studio, state.ui);
        } else if (drag.kind === 'palette') {
            drag.tool.classList.remove('is-dragging');
            if (!cancelled && drag.dragged) dropTool(drag, event);
            else refresh();
        } else if (cancelled) {
            refresh();
        } else {
            dropModule(drag, event);
        }
    }

    // keep each roll so linked modules can use its result.
    function rollDice(module) {
        var dice = diceStats(module);
        var rolls = Array.from({ length: dice.count }, function () { return Math.floor(Math.random() * dice.sides) + 1; });
        var kept = dice.keep ? rolls.slice().sort(function (a, b) { return b - a; }).slice(0, dice.keep) : rolls;
        dispatch({ type: 'player', key: 'rollResults', id: module.id, value: {
            rolls: rolls,
            kept: kept,
            keepHighest: dice.keep,
            bonus: dice.bonus,
            total: kept.reduce(function (sum, roll) { return sum + roll; }, 0) + dice.bonus
        } });
    }

    // handle clicks here, including buttons added when the sheet is redrawn.
    function handleClick(event) {
        var target = event.target;
        var developer = state.ui.mode === 'developer';
        var view = target.closest('[data-view-button]');
        if (view) {
            setUi({ mode: view.dataset.viewButton, selectedId: null, selectedModuleIds: [], activeDrag: null });
            developer = state.ui.mode === 'developer';
            studio.dataset.mode = state.ui.mode;
            studio.querySelectorAll('[data-view-button]').forEach(function (button) {
                button.setAttribute('aria-selected', String(button === view));
            });
            studio.querySelector('[data-workspace-title]').textContent = developer ?
                'Developer canvas' : (state.document.name || 'Character sheet');
            studio.querySelector('[data-workspace-help]').textContent = developer ?
                'Snap modules into the grid. Drag modules into a group to keep related fields together.' :
                'Enter values, toggle conditions, and roll dice to test the sheet.';
            return;
        }
        var addModifier = target.closest('[data-add-modifier]');
        if (addModifier) return dispatch({ type: 'add-modifier', id: addModifier.dataset.addModifier });
        var removeModifier = target.closest('[data-remove-modifier]');
        if (removeModifier) {
            var row = removeModifier.closest('[data-modifier-index]');
            return dispatch({ type: 'remove-modifier', id: row.dataset.moduleId, index: Number(row.dataset.modifierIndex) });
        }
        var roll = target.closest('[data-roll-module]');
        if (roll) {
            var dice = findModule(state.document.modules, roll.dataset.rollModule);
            if (dice) rollDice(dice);
            return;
        }
        if (!developer) return;

        var preset = target.closest('[data-load-preset]');
        if (preset) return dispatch({ type: 'load-preset', modules: builtinPresets[preset.dataset.loadPreset] });
        var savedPreset = target.closest('[data-saved-preset]');
        if (savedPreset) {
            var saved = state.document.savedPresets[Number(savedPreset.dataset.savedPreset)];
            if (saved) dispatch({ type: 'load-preset', modules: saved.modules });
            return;
        }
        if (target.closest('[data-save-preset]') && state.ui.selectedModuleIds.length) {
            var nameInput = studio.querySelector('#preset-name');
            dispatch({ type: 'save-preset', name: nameInput.value.trim() });
            nameInput.value = '';
            return;
        }
        var tool = target.closest('[data-module-tool]');
        if (tool) {
            if (!state.ui.suppressToolClick) dispatch({ type: 'add-module', moduleType: tool.dataset.moduleTool });
            return;
        }
        var remove = target.closest('[data-remove-module]');
        if (remove) return dispatch({ type: 'remove-modules', ids: [remove.dataset.removeModule] });
        var edit = target.closest('[data-edit-module]');
        if (edit) setUi({ selectedId: edit.dataset.editModule, selectedModuleIds: [] });
    }

    // save playtest entries as player values and edit-mode entries on the sheet so that stuff youre playtesting doesnt get saved to the .json format 
    function handleInputs(event) {
        var target = event.target;
        var playtest = state.ui.mode === 'playtest';
        var isSelect = target.tagName === 'SELECT';
        var valueInput = target.closest('[data-module-value]');
        if (valueInput && event.type === 'input') {
            var id = valueInput.dataset.moduleValue;
            dispatch(playtest ?
                { type: 'player', key: 'values', id: id, value: valueInput.value, render: false } :
                { type: 'update-document-value', id: id, value: valueInput.value, render: false });
            updateLiveValues(studio, state, api);
            return;
        }
        var checkbox = event.type === 'change' && target.closest('[data-module-checked]');
        if (checkbox) {
            var checkId = checkbox.dataset.moduleChecked;
            dispatch(playtest ?
                { type: 'player', key: 'checked', id: checkId, value: checkbox.checked } :
                { type: 'update-setting', id: checkId, setting: 'checked', value: checkbox.checked });
            return;
        }
        // update text fields while typing and dropdowns when a choice is made.
        if (!((event.type === 'input' && !isSelect) || (event.type === 'change' && isSelect))) return;
        var setting = target.dataset.setting;
        if (setting && !playtest) {
            var selected = findModule(state.document.modules, state.ui.selectedId);
            if (!selected) return;
            var inPlace = setting === 'name' || numericSettings.includes(setting);
            dispatch({ type: 'update-setting', id: selected.id, setting: setting, value: target.value, render: !inPlace });
            if (setting === 'name') {
                var title = studio.querySelector('[data-sheet-module="' + selected.id + '"] [data-module-title]');
                if (title) title.textContent = target.value || moduleTypes[selected.type].name;
            } else if (inPlace) {
                updateLiveValues(studio, state, api);
            }
            return;
        }
        if (target.dataset.modifierSetting) {
            var modifierRow = target.closest('[data-modifier-index]');
            dispatch({
                type: 'update-modifier', id: modifierRow.dataset.moduleId,
                index: Number(modifierRow.dataset.modifierIndex),
                setting: target.dataset.modifierSetting, value: target.value
            });
        }
    }

    // check the sheet before publishing, show a message if saving fails.
    async function saveAction(kind) {
        var meta = document.querySelector('meta[name="csrf-token"]');
        var token = studio.dataset.csrfToken || (meta && meta.content);
        try {
            if (kind === 'publish') {
                var problems = validate(state.document);
                if (problems.length) {
                    window.alert(problems.join('\n'));
                    return;
                }
            }
            await save(state.document, kind === 'draft' ? studio.dataset.saveDraftUrl : studio.dataset.publishUrl, token);
        } catch (error) {
            console.error('Template builder ' + kind + ' failed:', error);
            window.alert('todo'); //saving to the database hasnt been done yet, so it just shows this message
        }
    }

    function downloadTemplate() {
        var url = URL.createObjectURL(new Blob([downloadJson(state.document)], { type: 'application/json' }));
        var link = document.createElement('a');
        link.href = url;
        link.download = (state.document.name || 'template').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    function handleKeydown(event) {
        var editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
        if (editing) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        } else if ((event.key === 'Backspace' || event.key === 'Delete') && state.ui.mode === 'developer') {
            event.preventDefault();
            deleteSelected();
        }
    }

    /* start the builder */
    // load the last draft, then draw the sheet.
    function attachListeners() {
        studio.addEventListener('pointerdown', startPointer);
        studio.addEventListener('pointermove', movePointer);
        ['pointerup', 'pointercancel'].forEach(function (type) {
            studio.addEventListener(type, function (event) { finishPointer(event, type === 'pointercancel'); });
        });
        studio.addEventListener('keydown', handleKeydown);
        studio.addEventListener('click', handleClick);
        studio.addEventListener('input', handleInputs);
        studio.addEventListener('change', handleInputs);
        [['name', '#sheet-name'], ['description', '#sheet-description']].forEach(function (pair) {
            studio.querySelector(pair[1]).addEventListener('input', function (event) {
                dispatch({ type: 'update-document-meta', key: pair[0], value: event.target.value, render: false });
                if (pair[0] === 'name' && state.ui.mode === 'playtest') {
                    studio.querySelector('[data-workspace-title]').textContent = event.target.value || 'Character sheet';
                }
            });
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