// handles clicks and keeps track of the sheet, it uses the other modules to build and save it.
import { autosave, clearAutosave, downloadJson, restore, save, validate } from './modules-database.js';
import {
    renderCanvas,
    renderInspector,
    renderSavedPresets,
    setPlacement,
    updateLiveValues,
    updatePresetSelection
} from './modules-render.js';
import { builtinPresets, clonePresetModules, moduleSize, moduleTypes } from './modules-config.js';
import {
    clone, findModule, flatten, layoutColumns, linkSettings, findModuleEntry as helperFindEntry,
    isChecked, listCellKey, getListRows, clamp, parseListCellReference
} from './modules-helper.js';

/* sheet state */
var studio = document.querySelector('[data-sheet-studio]');
if (studio) {
    var playerSheet = studio.hasAttribute('data-player-sheet');
    var rootCanvas = studio.querySelector('[data-root-canvas]');
    var numericSettings = [
        'value', 'count', 'sides', 'uncheckedValue', 'checkedValue', 'colSpan', 'rowSpan',
        'keepHighest', 'leftValue', 'rightValue', 'groupColumns'
    ];
    var documentActions = [
        'add-module', 'remove-modules', 'update-setting', 'update-modifier',
        'add-modifier', 'remove-modifier', 'load-preset', 'save-preset', 'move-module', 'move-modules',
        'reparent-module', 'update-document-value', 'update-list-cell', 'update-list-column',
        'update-list-stat', 'update-list-row-source', 'add-list-column', 'remove-list-column', 'add-list-row',
        'remove-list-row', 'add-list-stat', 'remove-list-stat',
        'update-document-meta', 'restore-document',
        'update-choice', 'add-choice', 'remove-choice'
    ];

    var state = {
        document: { name: '', description: '', modules: [], savedPresets: [] },
        ui: {
            mode: playerSheet ? 'playtest' : 'developer',
            selectedId: null,
            selectedModuleIds: [],
            activeGroupTabs: {},
            activeDrag: null,
            suppressToolClick: false
        },
        player: {
            values: {}, checked: {}, rollResults: {}, listRows: {},
            listEditing: {}, valueEditing: {}, lastRoll: null
        },
        history: { undo: [], redo: [] },
        nextModuleId: 1
    };
    var pendingDraft = null;

    var isPlaytest = function() { return state.ui.mode === 'playtest'; };
    var isDeveloper = function() { return state.ui.mode === 'developer'; };

    function setDocumentFields() {
        if (playerSheet) return;
        studio.querySelector('#sheet-name').value = state.document.name || '';
        studio.querySelector('#sheet-description').value = state.document.description || '';
    }

    function updateResponsiveColumns() {
        var style = getComputedStyle(rootCanvas);
        var cellSize = parseFloat(style.getPropertyValue('--canvas-row-size'));
        var gap = parseFloat(style.columnGap) || 0;
        var horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        if (!Number.isFinite(cellSize) || cellSize <= 0) return false;
        var availableWidth = Math.max(0, rootCanvas.clientWidth - horizontalPadding);
        var columns = Math.max(1, Math.floor((availableWidth + gap) / (cellSize + gap)));
        var previousColumns = Number(style.getPropertyValue('--layout-columns').trim());
        if (columns === previousColumns) return false;
        rootCanvas.style.setProperty('--layout-columns', String(columns));
        return true;
    }

    function handleDialogClose() {
        studio.querySelector('[data-draft-dialog]').close();
        refresh();
    }

    function continueDraft() {
        if (!pendingDraft) return;
        dispatch({ type: 'restore-document', document: pendingDraft, recordHistory: false, render: false });
        pendingDraft = null;
        setDocumentFields();
        handleDialogClose();
    }

    function startFresh() {
        var errorMessage = studio.querySelector('[data-draft-error]');
        errorMessage.hidden = true;
        try {
            clearAutosave();
        } catch (error) {
            console.error('Template builder draft cleanup failed:', error);
            errorMessage.textContent = 'The saved draft could not be cleared. Try again or continue with it.';
            errorMessage.hidden = false;
            return;
        }
        pendingDraft = null;
        handleDialogClose();
    }

    function findModuleEntry(id, list) {
        return helperFindEntry(id, list || state.document.modules);
    }

    function clearListValues(id) {
        Object.keys(state.player.values).forEach(function (key) {
            if (key.indexOf(id + ':') === 0) delete state.player.values[key];
        });
        delete state.player.listRows[id];
    }

    function listRows(module) {
        return getListRows(module, isPlaytest() ? state.player.listRows : null);
    }

    function listCellValue(module, rowIndex, columnIndex) {
        var row = listRows(module)[rowIndex];
        var key = listCellKey(module.id, rowIndex, columnIndex);
        if (isPlaytest() && state.player.values[key] !== undefined) {
            return state.player.values[key];
        }
        return row && row.cells && row.cells[columnIndex] != null ? row.cells[columnIndex] : '';
    }

    function listLength(module) {
        var rows = listRows(module);
        var columns = module.columns || [];
        return rows.filter(function (row, rowIndex) {
            return columns.some(function (column, columnIndex) {
                if (column.source || column.rowSources && column.rowSources[rowIndex]) return false;
                var key = listCellKey(module.id, rowIndex, columnIndex);
                var value = state.ui.mode === 'playtest' && state.player.values[key] !== undefined ?
                    state.player.values[key] : row && row.cells && row.cells[columnIndex];
                if (column.type === 'checkbox') return value === true || value === 'true' || value === '1' || value === 'on';
                return value != null && String(value).trim() !== '';
            });
        }).length;
    }

    function referencedModuleId(source) {
        return String(source || '').replace(/\.\d+\.\d+$|\.length$/, '');
    }

    function makeModule(type, id, siblings) {
        var columns = siblings === state.document.modules ? 12 : 6;
        var colSpan = Math.min(
            type === 'pages' ? columns : type === 'group' ? Math.min(6, columns) :
                type === 'list' ? 8 : moduleSize.colSpan,
            columns
        );
        var rowSpan = type === 'pages' ? 8 : type === 'group' ? 5 : type === 'list' ? 5 : moduleSize.rowSpan;
        var preferred = { col: 1 + (siblings.length % 3) * 4, row: 1 + Math.floor(siblings.length / 3) * 3 };
        return Object.assign(
            { id: id, type: type, name: moduleTypes[type].name },
            findOpenPlacement(siblings, columns, colSpan, rowSpan, preferred),
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
            if (Math.abs(row - preferred.row) * 2 > bestDistance) break;
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

    function displaceOverlappingModules(modules, draggedId, draggedPlacement) {
        var placements = [{ id: draggedId, placement: draggedPlacement }];
        var remaining = modules.filter(function (module) { return module.id !== draggedId; })
            .slice()
            .sort(function (first, second) {
                return first.row - second.row || first.col - second.col;
            });

        remaining.forEach(function (module) {
            var placement = {
                col: module.col,
                row: module.row,
                colSpan: module.colSpan,
                rowSpan: module.rowSpan
            };
            while (placements.some(function (placed) {
                return placementsOverlap(placement, placed.placement);
            })) {
                placement.row += 1;
            }
            placements.push({ id: module.id, placement: placement });
        });
        return placements;
    }

    function layoutRowStep(layout) {
        var style = getComputedStyle(layout);
        var rowSize = style.gridAutoRows.match(/[\d.]+px/);
        var rowHeight = parseFloat(rowSize ? rowSize[0] : style.gridAutoRows);
        var rowGap = parseFloat(style.rowGap) || 0;
        return (Number.isFinite(rowHeight) ? rowHeight : 64) + rowGap;
    }

    function layoutColumnStep(layout) {
        var style = getComputedStyle(layout);
        var columnSize = style.gridTemplateColumns.match(/^[\d.]+px/);
        var columnWidth = parseFloat(columnSize ? columnSize[0] : '');
        var columnGap = parseFloat(style.columnGap) || 0;
        return (Number.isFinite(columnWidth) ? columnWidth : layout.getBoundingClientRect().width / layoutColumns(layout)) +
            columnGap;
    }

    function layoutContentOrigin(layout) {
        var style = getComputedStyle(layout);
        var rect = layout.getBoundingClientRect();
        return {
            left: rect.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0),
            top: rect.top + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0)
        };
    }

    function snappedPlacement(module, layout, start, x, y, resize) {
        var columns = layoutColumns(layout);
        var columnsMoved = Math.round((x - start.x) / layoutColumnStep(layout));
        var rowsMoved = Math.round((y - start.y) / layoutRowStep(layout));
        if (resize) {
            return Object.assign({}, module, {
                colSpan: Math.max(1, Math.min(columns - module.col + 1, start.colSpan + columnsMoved)),
                rowSpan: Math.max(1, start.rowSpan + rowsMoved)
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

    function resolveListCell(id, parsed, seen) {
        var cellList = findModule(state.document.modules, parsed.moduleId);
        if (!cellList || cellList.type !== 'list' || parsed.row < 0 || parsed.column < 0 ||
            !cellList.rows[parsed.row] || !cellList.columns[parsed.column] || seen[id]) return 0;
        var cellKey = String(id);
        seen[cellKey] = true;
        var column = cellList.columns[parsed.column];
        var rowSource = column.rowSources && column.rowSources[parsed.row];
        var source = rowSource || column.source;
        var value = source ? resolveValue(source, seen) : listCellValue(cellList, parsed.row, parsed.column);

        value = column.type === 'checkbox' ? (isChecked(value) ? 1 : 0) : Number(value) || 0;

        delete seen[cellKey];
        return value;
    }

    function resolveListLength(id, seen) {
        var listId = String(id).slice(0, -7);
        var list = findModule(state.document.modules, listId);
        if (!list || list.type !== 'list' || seen[listId]) return null;

        seen[listId] = true;
        var length = listLength(list);
        delete seen[listId];
        return length;
    }

    function resolveValue(id, seen) {
        seen = seen || {};
        var cell = parseListCellReference(id);
        if (cell) return resolveListCell(id, cell, seen);

        if (/\.length$/.test(String(id))) {
            var listLengthValue = resolveListLength(id, seen);
            if (listLengthValue !== null) return listLengthValue;
            return '';
        }

        var module = findModule(state.document.modules, id);
        if (!module || ['pages', 'group'].includes(module.type) || seen[id]) return '';
        seen[id] = true;

        var typed = isPlaytest() ? state.player.values[id] : undefined;
        var kind = moduleTypes[module.type].valueKind;
        var value = getValue(module, kind, typed);

        if (kind === 'number') {
            value = Number(value) || 0;
            applyModifiers(module, value);
        }

        delete seen[id];
        return value;
    }

    function getValue(module, kind, typed) {
        if (module.type === 'list') {
            return listLength(module);
        } else if (kind === 'dice') {
            var roll = isPlaytest() ? state.player.rollResults[module.id] : null;
            return roll ? roll.total : 0;
        } else if (kind === 'math') {
            return calculateMath(module, {}).result;
        } else if (kind === 'choice') {
            return resolveChoiceValue(module, typed);
        } else if (module.source) {
            return resolveValue(module.source, {});
        } else if (kind === 'number') {
            return typed !== undefined ? typed : module.value || 0;
        } else if (kind === 'checkbox') {
            var checked = isPlaytest() ? state.player.checked[module.id] : module.checked;
            return Number(checked ? module.checkedValue : module.uncheckedValue);
        } else {
            return typed !== undefined ? typed : module.value || '';
        }
    }

    function resolveChoiceValue(module, typed) {
        var selected = typed !== undefined ? typed : module.value;
        var selectedOption = (module.choices || []).find(function (option) {
            return option && option.source === selected;
        });
        return selectedOption ? resolveValue(selectedOption.source, {}) : 0;
    }

    function applyModifiers(module, value) {
        (module.modifiers || []).forEach(function (modifier) {
            var checkbox = findModule(state.document.modules, modifier.source);
            var checked = checkbox && checkbox.type === 'checkbox' &&
                (isPlaytest() ? state.player.checked[checkbox.id] : checkbox.checked);
            if (checked) value += Number(modifier.amount || 0);
        });
    }

    function calculateMath(module, seen) {
        function side(name) {
            var source = module[name + 'Source'];
            return Number(source ? resolveValue(source, seen) : module[name + 'Value'] || 0);
        }
        var left = side('left');
        var right = side('right');
        var result;
        if (module.mathOperation === 'abilityModifier') {
            result = Math.floor((left - 10) / 2);
        } else if (module.mathOperation === 'proficiencyBonus') {
            result = Math.floor((Math.max(1, left) - 1) / 4) + 2;
        } else if (module.mathOperation === 'minimum') {
            result = Math.min(left, right);
        } else if (module.mathOperation === 'maximum') {
            result = Math.max(left, right);
        } else if (module.mathOperation === 'lookup') {
            var lookup = (module.lookupEntries || []).find(function (entry) {
                return Number(entry.input) === left;
            });
            result = lookup ? Number(lookup.output) : right;
        } else {
            result = (mathOperations[module.mathOperation] || mathOperations.add)(left, right);
        }
        if (module.mathOperation === 'divide' && module.mathRounding === 'up') result = Math.ceil(result);
        if (module.mathOperation === 'divide' && module.mathRounding === 'down') result = Math.floor(result);
        var zeroError = Number.isNaN(result) && right === 0;
        return { left: left, right: right, result: result, error: zeroError ? 'Cannot divide or modulo by zero' : '' };
    }

    // use a linked module for a dice setting when one is selected.
    function diceSetting(module, name, fallback, min, max) {
        var source = module[name + 'Source'];
        var value = source ? resolveValue(source) : module[name];
        return clamp(Math.floor(Number(value) || fallback), min, max);
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
        updateResponsiveColumns();
        renderCanvas(studio, state, api);
        if (!playerSheet) {
            renderInspector(studio, state, api);
            updatePresetSelection(studio, state.ui);
        }
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

    function handleAddModule(action) {
        var parent = action.parentId ? findModule(state.document.modules, action.parentId) : null;
        if ((action.parentId && (!parent || !['pages', 'group'].includes(parent.type))) ||
            (parent && (action.moduleType === 'pages' ||
                (parent.type === 'group' && ['pages', 'group'].includes(action.moduleType))))) return;
        var siblings = parent ? parent.children : state.document.modules;
        var added = Object.assign(makeModule(action.moduleType, String(state.nextModuleId), siblings), action.placement);
        if (parent && parent.type === 'pages') {
            Object.assign(added, { col: 1, row: 1 });
        } else if (parent && parent.type === 'group') {
            var groupColumns = Math.max(1, Math.min(6, Number(parent.groupColumns) || 2));
            added.colSpan = Math.min(added.colSpan, groupColumns);
            Object.assign(added, nearestPlacement(siblings, added, groupColumns, { col: 1, row: 1 }));
        }
        state.nextModuleId += 1;
        siblings.push(added);
        if (parent && parent.type === 'pages') state.ui.activeGroupTabs[parent.id] = added.id;
        choose(action.keepSelection && parent ? parent.id : added.id);
    }

    function clearRemovedLinks(removed) {
        flatten(state.document.modules).forEach(function (module) {
            linkSettings.forEach(function (setting) {
                if (removed[referencedModuleId(module[setting])]) module[setting] = '';
            });
            module.modifiers = (module.modifiers || []).filter(function (item) { return !removed[item.source]; });
            (module.stats || []).forEach(function (stat) { if (removed[referencedModuleId(stat.source)]) stat.source = ''; });
            (module.columns || []).forEach(function (column) {
                if (removed[referencedModuleId(column.source)]) column.source = '';
                (column.rowSources || []).forEach(function (source, index) {
                    if (removed[referencedModuleId(source)]) column.rowSources[index] = '';
                });
            });
            (module.choices || []).forEach(function (choice) { if (removed[referencedModuleId(choice.source)]) choice.source = ''; });
        });
    }

    function handleRemoveModules(action) {
        var removed = {};
        action.ids.forEach(function (id) {
            var entry = findModuleEntry(id);
            if (!entry) return;
            flatten([entry.module]).forEach(function (module) { removed[module.id] = true; });
            entry.list.splice(entry.index, 1);
        });
        clearRemovedLinks(removed);
        choose(null);
    }

    function clampSetting(setting, value) {
        if (setting === 'colSpan') return Math.max(1, Math.min(layoutColumns(rootCanvas), Math.round(value)));
        if (setting === 'rowSpan') return Math.max(1, Math.min(12, Math.round(value)));
        if (setting === 'groupColumns') return Math.max(1, Math.min(6, Math.round(value)));
        return value;
    }

    function handleUpdateSetting(action) {
        var target = findModule(state.document.modules, action.id);
        if (!target) return;
        if (numericSettings.includes(action.setting)) {
            target[action.setting] = clampSetting(action.setting, Number(action.value));
        } else {
            target[action.setting] = action.value;
        }
        if (linkSettings.includes(action.setting)) state.player.rollResults[target.id] = null;
        if (target.type === 'pages' && (action.setting === 'colSpan' || action.setting === 'rowSpan')) {
            var entry = findModuleEntry(target.id);
            if (entry) Object.assign(target, nearestPlacement(entry.list, target, layoutColumns(rootCanvas), target));
        }
        if (target.type === 'group' && action.setting === 'groupColumns') {
            (target.children || []).forEach(function (child) {
                child.colSpan = Math.min(child.colSpan, target.groupColumns);
                Object.assign(child, nearestPlacement(target.children, child, target.groupColumns, { col: child.col, row: child.row }));
            });
        }
    }

    function handleUpdateModifier(action) {
        var module = findModule(state.document.modules, action.id);
        if (module && module.modifiers && module.modifiers[action.index]) {
            module.modifiers[action.index][action.setting] = action.setting === 'amount' ? Number(action.value) : action.value;
        }
    }

    function handleAddModifier(action) {
        var module = findModule(state.document.modules, action.id);
        if (!module) return;
        var checkbox = flatten(state.document.modules).find(function (item) { return item.type === 'checkbox'; });
        module.modifiers = module.modifiers || [];
        module.modifiers.push({ source: checkbox ? checkbox.id : '', amount: -1 });
        state.ui.selectedId = module.id;
    }

    function handleRemoveModifier(action) {
        var module = findModule(state.document.modules, action.id);
        if (module && module.modifiers) module.modifiers.splice(action.index, 1);
    }

    function handleLoadPreset(action) {
        var loaded = clonePresetModules(action.modules, state.nextModuleId);
        var cols = layoutColumns(rootCanvas);
        state.nextModuleId = loaded.nextId;
        loaded.modules.forEach(function (module) {
            module.colSpan = Math.min(module.colSpan, cols);
            Object.assign(module, nearestPlacement(state.document.modules, module, cols, module));
            state.document.modules.push(module);
        });
        choose(loaded.modules.length ? loaded.modules[loaded.modules.length - 1].id : null);
    }

    function handleSavePreset(action) {
        var selected = state.document.modules.filter(function (m) { return state.ui.selectedModuleIds.includes(m.id); });
        state.document.savedPresets.push({
            name: action.name || 'Preset ' + (state.document.savedPresets.length + 1),
            modules: clone(selected)
        });
        state.ui.selectedModuleIds = [];
    }

    function handleMoveModule(action) {
        var module = findModule(state.document.modules, action.id);
        if (module) Object.assign(module, action.placement);
    }

    function handleMoveModules(action) {
        action.placements.forEach(function (item) {
            var module = findModule(state.document.modules, item.id);
            if (module) Object.assign(module, item.placement);
        });
    }

    function handleReparentModule(action) {
        var entry = findModuleEntry(action.id);
        var newParent = action.parentId ? findModule(state.document.modules, action.parentId) : null;
        if (!entry || (action.parentId && !newParent) ||
            (newParent && (!['pages', 'group'].includes(newParent.type) ||
                entry.module.type === 'pages' ||
                (newParent.type === 'group' && ['pages', 'group'].includes(entry.module.type))))) return;
        var targetList = newParent ? newParent.children : state.document.modules;
        var cols = newParent && newParent.type === 'group' ? Math.max(1, Math.min(6, Number(newParent.groupColumns) || 2)) : newParent ? 6 : layoutColumns(rootCanvas);
        var prevParent = entry.parent;
        entry.list.splice(entry.index, 1);
        if (prevParent && prevParent.type === 'pages' && state.ui.activeGroupTabs[prevParent.id] === entry.module.id) {
            state.ui.activeGroupTabs[prevParent.id] = prevParent.children[0] && prevParent.children[0].id;
        }
        entry.module.colSpan = Math.min(entry.module.colSpan, newParent ? (newParent.type === 'pages' ? 6 : cols) : 
            (entry.module.type === 'list' ? 8 : entry.module.type === 'pages' ? layoutColumns(rootCanvas) : moduleSize.colSpan));
        if (newParent && newParent.type === 'pages') {
            Object.assign(entry.module, { col: 1, row: 1 });
        } else {
            Object.assign(entry.module, nearestPlacement(targetList, entry.module, cols, { col: 1, row: 1 }));
        }
        targetList.push(entry.module);
        if (newParent) state.ui.activeGroupTabs[newParent.id] = entry.module.id;
        if (action.selectionId) state.ui.selectedId = action.selectionId;
    }

    function findAndUpdate(id, callback) {
        var module = findModule(state.document.modules, id);
        if (module) callback(module);
        return module;
    }

    function handleUpdateDocumentValue(action) {
        findAndUpdate(action.id, function(module) {
            module.value = action.value;
        });
    }

    function handleUpdateListCell(action) {
        findAndUpdate(action.id, function(module) {
            if (module.rows[action.row] && module.rows[action.row].cells) {
                module.rows[action.row].cells[action.column] = action.value;
            }
        });
    }

    function handleUpdateListColumn(action) {
        findAndUpdate(action.id, function(module) {
            if (module.columns[action.index]) {
                module.columns[action.index][action.setting] = action.value;
            }
        });
    }

    function handleUpdateListRowSource(action) {
        findAndUpdate(action.id, function(module) {
            var column = module.columns[action.column];
            if (column) {
                column.rowSources = column.rowSources || [];
                column.rowSources[action.row] = action.value;
            }
        });
    }

    function handleUpdateListStat(action) {
        findAndUpdate(action.id, function(module) {
            if (module.stats[action.index]) {
                module.stats[action.index][action.setting] = action.value;
            }
        });
    }

    function handleUpdateChoice(action) {
        findAndUpdate(action.id, function(module) {
            if (module.choices && module.choices[action.index]) {
                module.choices[action.index][action.setting] = action.value;
            }
        });
    }

    function handleAddChoice(action) {
        findAndUpdate(action.id, function(module) {
            module.choices = module.choices || [];
            module.choices.push({ label: 'Option ' + (module.choices.length + 1), source: '' });
        });
    }

    function handleRemoveChoice(action) {
        findAndUpdate(action.id, function(module) {
            if (module.choices && Number.isInteger(action.index) && action.index >= 0 && action.index < module.choices.length) {
                module.choices.splice(action.index, 1);
            }
        });
    }

    function handleAddListColumn(action) {
        findAndUpdate(action.id, function(module) {
            module.columns.push({ name: 'Column ' + (module.columns.length + 1), type: 'text' });
            module.rows.forEach(function (row) { row.cells.push(''); });
            clearListValues(module.id);
        });
    }

    function handleRemoveListColumn(action) {
        findAndUpdate(action.id, function(module) {
            if (module.columns.length <= 1 || !Number.isInteger(action.index) || action.index < 0 || action.index >= module.columns.length) return;
            module.columns.splice(action.index, 1);
            module.rows.forEach(function (row) { row.cells.splice(action.index, 1); });
            clearListValues(module.id);
        });
    }

    function handleAddListRow(action) {
        findAndUpdate(action.id, function(module) {
            module.rows.push({ cells: module.columns.map(function () { return ''; }) });
            module.rowSpan = Math.max(module.rowSpan, module.rows.length + 2);
            clearListValues(module.id);
        });
    }

    function handleRemoveListRow(action) {
        findAndUpdate(action.id, function(module) {
            if (module.rows.length <= 1 || !Number.isInteger(action.index) || action.index < 0 || action.index >= module.rows.length) return;
            module.rows.splice(action.index, 1);
            module.columns.forEach(function (col) {
                if (col.rowSources) col.rowSources.splice(action.index, 1);
            });
            clearListValues(module.id);
        });
    }

    function handleAddListStat(action) {
        findAndUpdate(action.id, function(module) {
            module.stats = module.stats || [];
            module.stats.push({ name: 'Stat ' + (module.stats.length + 1), value: '', source: '' });
        });
    }

    function handleRemoveListStat(action) {
        findAndUpdate(action.id, function(module) {
            if (Array.isArray(module.stats) && Number.isInteger(action.index) && action.index >= 0 && action.index < module.stats.length) {
                module.stats.splice(action.index, 1);
            }
        });
    }

    var actionHandlers = new Map([
        ['add-module', handleAddModule],
        ['remove-modules', handleRemoveModules],
        ['update-setting', handleUpdateSetting],
        ['update-modifier', handleUpdateModifier],
        ['add-modifier', handleAddModifier],
        ['remove-modifier', handleRemoveModifier],
        ['load-preset', handleLoadPreset],
        ['save-preset', handleSavePreset],
        ['move-module', handleMoveModule],
        ['move-modules', handleMoveModules],
        ['reparent-module', handleReparentModule],
        ['update-document-value', handleUpdateDocumentValue],
        ['update-list-cell', handleUpdateListCell],
        ['update-list-column', handleUpdateListColumn],
        ['update-list-row-source', handleUpdateListRowSource],
        ['update-list-stat', handleUpdateListStat],
        ['update-choice', handleUpdateChoice],
        ['add-choice', handleAddChoice],
        ['remove-choice', handleRemoveChoice],
        ['add-list-column', handleAddListColumn],
        ['remove-list-column', handleRemoveListColumn],
        ['add-list-row', handleAddListRow],
        ['remove-list-row', handleRemoveListRow],
        ['add-list-stat', handleAddListStat],
        ['remove-list-stat', handleRemoveListStat]
    ]);

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
            case 'roll-result':
                state.player.lastRoll = action.value;
                break;
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
                var restoredDocument = clone(action.document);
                if (restoredDocument.schemaVersion === 1) {
                    function migrateModules(modules) {
                        (modules || []).forEach(function (module) {
                            if (module.type === 'group') module.type = 'pages';
                            migrateModules(module.children);
                        });
                    }
                    migrateModules(restoredDocument.modules);
                    restoredDocument.schemaVersion = 2;
                }
                state.document = Object.assign({ savedPresets: [] }, restoredDocument);
                state.nextModuleId = flatten(state.document.modules).reduce(function (next, module) {
                    var numericId = Number(module.id);
                    return Number.isFinite(numericId) ? Math.max(next, numericId + 1) : next;
                }, 1);
                choose(null);
                break;
            default:
                var handler = actionHandlers.get(action.type);
                if (!handler) return;
                handler(action);
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
        var groupDropzone = target && target.closest('[data-group-dropzone]');
        if (groupDropzone) {
            return { element: groupDropzone, owner: findModule(state.document.modules, groupDropzone.dataset.groupDropzone) };
        }
        var pagesDropzone = target && target.closest('[data-pages-dropzone]');
        if (pagesDropzone) {
            return { element: pagesDropzone, owner: findModule(state.document.modules, pagesDropzone.dataset.pagesDropzone) };
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
        var dragHeader = target.closest('[data-module-drag-handle]');
        var interactiveTarget = target.closest('button, a, input, select, textarea, [contenteditable="true"]');
        var handle = resize || (!interactiveTarget && dragHeader);
        if (!handle) return;
        var card = target.closest('[data-sheet-module]');
        if (!card) return;
        var module = findModule(state.document.modules, card.dataset.sheetModule);
        if (!module) return;
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
        drag.placement = { col: preview.col, row: preview.row, colSpan: preview.colSpan, rowSpan: preview.rowSpan };
        if (drag.resize) {
            if (entry.list.some(function (item) { return item.id !== module.id && placementsOverlap(preview, item); })) return;
            setPlacement(drag.element, preview, drag.layout);
            return;
        }
        drag.previewPlacements = displaceOverlappingModules(entry.list, module.id, drag.placement);
        drag.previewPlacements.forEach(function (item) {
            var sibling = Array.prototype.find.call(drag.layout.children, function (element) {
                return element.dataset.sheetModule === item.id;
            });
            if (sibling) setPlacement(sibling, item.placement, drag.layout);
        });
    }

    function dropTool(drag, event) {
        setUi({ suppressToolClick: true }, false);
        window.setTimeout(function () { setUi({ suppressToolClick: false }, false); }, 50);
        var destination = canvasForPoint(event.clientX, event.clientY);
        if (!destination) return;
        if (destination.owner && drag.type === 'pages') return;
        var columns = destination.owner && destination.owner.type === 'group' ?
            Math.max(1, Math.min(6, Number(destination.owner.groupColumns) || 2)) :
            destination.owner ? 6 : layoutColumns(destination.element);
        var siblings = destination.owner ? destination.owner.children : state.document.modules;
        var colSpan = Math.min(
            drag.type === 'pages' ? columns : drag.type === 'group' ? Math.min(6, columns) :
                drag.type === 'list' ? 8 : moduleSize.colSpan,
            columns
        );
        var rowSpan = drag.type === 'pages' ? 8 :
            drag.type === 'group' ? 5 : drag.type === 'list' ? 5 : moduleSize.rowSpan;
        var origin = layoutContentOrigin(destination.element);
        var rowStep = layoutRowStep(destination.element);
        var columnStep = layoutColumnStep(destination.element);
        var placement = nearestPlacement(siblings, { colSpan: colSpan, rowSpan: rowSpan }, columns, {
            col: Math.max(1, Math.min(columns - colSpan + 1, Math.floor((event.clientX - origin.left) / columnStep) + 1)),
            row: Math.max(1, Math.floor((event.clientY - origin.top) / rowStep) + 1)
        });
        dispatch({
            type: 'add-module',
            moduleType: drag.type,
            parentId: destination.owner && destination.owner.id,
            placement: placement,
            keepSelection: Boolean(destination.owner)
        });
    }

    function dropModule(drag, event) {
        var entry = findModuleEntry(drag.id);
        if (drag.resize) {
            dispatch({ type: 'move-module', id: drag.id, placement: drag.placement });
            return;
        }
        var target = document.elementFromPoint(event.clientX, event.clientY);
        var drop = canvasForPoint(event.clientX, event.clientY);
        // keep the module where it is if it is dropped outside a canvas or on itself.
        var owner = drop ? drop.owner : entry.parent;
        if (owner && owner.id === drag.id) owner = entry.parent;
        if ((entry.module.type === 'pages' || owner && owner.type === 'group' &&
            ['pages', 'group'].includes(entry.module.type)) && owner) {
            refresh();
            return;
        }
        if (owner && containsModule(entry.module, owner.id)) {
            refresh();
            return;
        }
        if (owner === entry.parent) dispatch({
            type: 'move-modules',
            placements: drag.previewPlacements || [{ id: drag.id, placement: drag.placement }]
        });
        else dispatch({
            type: 'reparent-module',
            id: drag.id,
            parentId: owner && owner.id,
            selectionId: owner && owner.id
        });
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
        var total = kept.reduce(function (sum, roll) { return sum + roll; }, 0) + dice.bonus;
        state.player.lastRoll = {
            name: module.name,
            formula: diceFormula(module),
            rolls: rolls,
            kept: kept,
            keepHighest: dice.keep,
            bonus: dice.bonus,
            total: total
        };
        dispatch({ type: 'player', key: 'rollResults', id: module.id, value: {
            rolls: rolls,
            kept: kept,
            keepHighest: dice.keep,
            bonus: dice.bonus,
            total: total
        } });
    }

    function rollListCell(moduleId, rowIndex, columnIndex) {
        var module = findModule(state.document.modules, moduleId);
        var column = module && module.columns[columnIndex];
        if (!module || !column || column.type !== 'dice') return;
        var formula = String(column.source ? resolveValue(column.source) : listCellValue(module, rowIndex, columnIndex)).trim();
        var compactFormula = formula.replace(/\s+/g, '');
        var terms = compactFormula.match(/[+-]?(?:\d*d\d+|\d+)/gi);
        if (!terms || !/^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/i.test(compactFormula)) {
            dispatch({ type: 'roll-result', value: { name: module.name, formula: formula, error: 'Enter a dice formula such as 2d6+1d4+3.' } });
            return;
        }
        var total = 0;
        var rolls = [];
        for (var index = 0; index < terms.length; index += 1) {
            var sign = terms[index][0] === '-' ? -1 : 1;
            var term = terms[index].replace(/^[+-]/, '');
            var dice = /^(\d*)d(\d+)$/i.exec(term);
            if (!dice) {
                var bonus = Number(term);
                if (!Number.isSafeInteger(bonus) || bonus > 1000000) {
                    dispatch({ type: 'roll-result', value: { name: module.name, formula: formula, error: 'Dice modifier must be within 1,000,000.' } });
                    return;
                }
                total += sign * bonus;
                continue;
            }
            var count = Number(dice[1] || 1);
            var sides = Number(dice[2]);
            if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
                dispatch({ type: 'roll-result', value: { name: module.name, formula: formula, error: 'Dice must be 1-100 dice with 2-1000 sides.' } });
                return;
            }
            var termRolls = Array.from({ length: count }, function () { return Math.floor(Math.random() * sides) + 1; });
            rolls = rolls.concat(termRolls.map(function (roll) { return sign * roll; }));
            total += sign * termRolls.reduce(function (sum, roll) { return sum + roll; }, 0);
        }
        dispatch({ type: 'roll-result', value: { name: module.name, formula: formula, rolls: rolls, total: total } });
    }

    var clickHandlers = {
        '[data-view-button]': function(target) {
            setUi({ mode: target.dataset.viewButton, selectedId: null, selectedModuleIds: [], activeDrag: null });
            studio.dataset.mode = state.ui.mode;
            studio.querySelectorAll('[data-view-button]').forEach(function (button) {
                button.setAttribute('aria-selected', String(button === target));
            });
            var isDev = isDeveloper();
            studio.querySelector('[data-workspace-title]').textContent = isDev ?
                'Developer canvas' : (state.document.name || 'Character sheet');
            studio.querySelector('[data-workspace-help]').textContent = isDev ?
                'Use Pages for tabs and Groups for compact field panels. Lists provide repeatable rows.' :
                'Enter values, toggle conditions, and roll dice to test the sheet.';
        },
        '[data-page-tab]': function(target) {
            var activeGroupTabs = Object.assign({}, state.ui.activeGroupTabs);
            activeGroupTabs[target.dataset.pageTab] = target.dataset.pageTabMember;
            setUi({ activeGroupTabs: activeGroupTabs });
            var selectedTab = document.getElementById(target.id);
            if (selectedTab) selectedTab.focus();
        },
        '[data-add-page]': function(target) {
            var pageType = Array.prototype.find.call(
                studio.querySelectorAll('[data-pages-module-type]'),
                function (select) { return select.dataset.pagesModuleType === target.dataset.addPage; }
            );
            if (pageType && pageType.value) {
                dispatch({
                    type: 'add-module',
                    moduleType: pageType.value,
                    parentId: target.dataset.addPage,
                    keepSelection: true
                });
            }
        },
        '[data-add-group-field]': function(target) {
            var fieldType = Array.prototype.find.call(
                studio.querySelectorAll('[data-group-field-type]'),
                function (select) { return select.dataset.groupFieldType === target.dataset.addGroupField; }
            );
            if (fieldType && fieldType.value) {
                dispatch({
                    type: 'add-module',
                    moduleType: fieldType.value,
                    parentId: target.dataset.addGroupField,
                    keepSelection: true
                });
            }
        },
        '[data-add-choice]': function(target) {
            dispatch({ type: 'add-choice', id: target.dataset.addChoice });
        },
        '[data-remove-choice]': function(target) {
            var choiceRow = target.closest('[data-choice-index]');
            dispatch({
                type: 'remove-choice',
                id: choiceRow.dataset.moduleId,
                index: Number(choiceRow.dataset.choiceIndex)
            });
        },
        '[data-ungroup-module]': function(target) {
            var selectedGroup = findModule(state.document.modules, state.ui.selectedId);
            dispatch({
                type: 'reparent-module',
                id: target.dataset.ungroupModule,
                parentId: null,
                selectionId: selectedGroup && ['pages', 'group'].includes(selectedGroup.type) ? selectedGroup.id : null
            });
        },
        '[data-add-modifier]': function(target) {
            dispatch({ type: 'add-modifier', id: target.dataset.addModifier });
        },
        '[data-remove-modifier]': function(target) {
            var row = target.closest('[data-modifier-index]');
            dispatch({ type: 'remove-modifier', id: row.dataset.moduleId, index: Number(row.dataset.modifierIndex) });
        },
        '[data-toggle-list-edit]': function(target) {
            dispatch({
                type: 'player',
                key: 'listEditing',
                id: target.dataset.toggleListEdit,
                value: !state.player.listEditing[target.dataset.toggleListEdit]
            });
        },
        '[data-toggle-value-edit]': function(target) {
            dispatch({
                type: 'player',
                key: 'valueEditing',
                id: target.dataset.toggleValueEdit,
                value: !state.player.valueEditing[target.dataset.toggleValueEdit]
            });
        },
        '[data-list-action]': function(target) {
            dispatch({
                type: target.dataset.listAction,
                id: target.dataset.moduleId,
                index: Number(target.dataset.index)
            });
        },
        '[data-add-player-list-row]': function(target) {
            var addRowModule = findModule(state.document.modules, target.dataset.addPlayerListRow);
            if (!addRowModule) return;
            dispatch({
                type: 'player',
                key: 'listRows',
                id: addRowModule.id,
                value: (state.player.listRows[addRowModule.id] || []).concat([{
                    cells: (addRowModule.columns || []).map(function () { return ''; })
                }])
            });
        },
        '[data-roll-list-cell]': function(target) {
            rollListCell(target.dataset.rollListCell, Number(target.dataset.row), Number(target.dataset.column));
        },
        '[data-roll-module]': function(target) {
            var dice = findModule(state.document.modules, target.dataset.rollModule);
            if (dice) rollDice(dice);
        },
        '[data-load-preset]': function(target) {
            if (isDeveloper()) dispatch({ type: 'load-preset', modules: builtinPresets[target.dataset.loadPreset] });
        },
        '[data-saved-preset]': function(target) {
            if (isDeveloper()) {
                var saved = state.document.savedPresets[Number(target.dataset.savedPreset)];
                if (saved) dispatch({ type: 'load-preset', modules: saved.modules });
            }
        },
        '[data-save-preset]': function(target) {
            if (isDeveloper() && state.ui.selectedModuleIds.length) {
                var nameInput = studio.querySelector('#preset-name');
                dispatch({ type: 'save-preset', name: nameInput.value.trim() });
                nameInput.value = '';
            }
        },
        '[data-module-tool]': function(target) {
            if (isDeveloper() && !state.ui.suppressToolClick) {
                dispatch({ type: 'add-module', moduleType: target.dataset.moduleTool });
            }
        },
        '[data-remove-module]': function(target) {
            if (isDeveloper()) dispatch({ type: 'remove-modules', ids: [target.dataset.removeModule] });
        },
        '[data-edit-module]': function(target) {
            if (isDeveloper()) setUi({ selectedId: target.dataset.editModule, selectedModuleIds: [] });
        }
    };

    function handleClick(event) {
        var target = event.target;
        for (var selector in clickHandlers) {
            var element = target.closest(selector);
            if (element) {
                clickHandlers[selector](element);
                return;
            }
        }
    }

    function dispatchPlayerOrDocumentChange(id, value, isPlaytestAction, actionType) {
        if (isPlaytest()) {
            dispatch({ type: 'player', key: isPlaytestAction, id: id, value: value, render: false });
        } else {
            var action = { id: id, value: value, render: false };
            if (actionType === 'value') {
                action.type = 'update-document-value';
            } else if (actionType === 'setting') {
                action.type = 'update-setting';
                action.setting = isPlaytestAction;
            }
            dispatch(action);
        }
    }

    function handlePlayerEdit(key, id, value) {
        dispatch({ type: 'player', key: key, id: id, value: value });
    }

    // Keep Playtest edits out of the saved template.
    function handleInputs(event) {
        var target = event.target;
        var isSelect = target.tagName === 'SELECT';
        var groupSizeSetting = target.dataset.setting;
        var selectedGroup = !isPlaytest() && findModule(state.document.modules, state.ui.selectedId);
        if (selectedGroup && selectedGroup.type === 'pages' &&
            (groupSizeSetting === 'colSpan' || groupSizeSetting === 'rowSpan')) {
            if (event.type !== 'change') return;
            var size = Number(target.value);
            if (!Number.isFinite(size)) return;
            size = Math.round(Math.max(Number(target.min), Math.min(Number(target.max), size)));
            dispatch({
                type: 'update-setting',
                id: selectedGroup.id,
                setting: groupSizeSetting,
                value: size
            });
            return;
        }
        var listCell = target.closest('[data-list-cell]');
        if (listCell && (event.type === 'input' || event.type === 'change')) {
            var listId = listCell.dataset.listCell;
            var rowIndex = Number(listCell.dataset.row);
            var columnIndex = Number(listCell.dataset.column);
            var listModule = findModule(state.document.modules, listId);
            var listColumn = listModule && listModule.columns[columnIndex];
            var cellValue = listCell.type === 'checkbox' ? listCell.checked : listCell.value;
            if (isPlaytest()) {
                var cellKey = listId + ':' + rowIndex + ':' + columnIndex;
                handlePlayerEdit('values', cellKey, cellValue);
            } else {
                dispatch({
                    type: 'update-list-cell', id: listId, row: rowIndex,
                    column: columnIndex, value: cellValue, render: false
                });
            }
            if (listColumn && listColumn.type === 'dice' && event.type === 'change') {
                refresh();
                return;
            }
            updateLiveValues(studio, state, api);
            return;
        }
        var valueInput = target.closest('[data-module-value]');
        if (valueInput && (event.type === 'input' || event.type === 'change')) {
            var id = valueInput.dataset.moduleValue;
            dispatchPlayerOrDocumentChange(id, valueInput.value, 'values', 'value');
            updateLiveValues(studio, state, api);
            return;
        }
        var checkbox = event.type === 'change' && target.closest('[data-module-checked]');
        if (checkbox) {
            var checkId = checkbox.dataset.moduleChecked;
            dispatchPlayerOrDocumentChange(checkId, checkbox.checked, 'checked', 'setting');
            return;
        }
        if (event.type === 'change' && target.type === 'checkbox' && target.dataset.setting && !isPlaytest()) {
            var selectedForCheckboxSetting = findModule(state.document.modules, state.ui.selectedId);
            if (selectedForCheckboxSetting) {
                dispatch({
                    type: 'update-setting',
                    id: selectedForCheckboxSetting.id,
                    setting: target.dataset.setting,
                    value: target.checked
                });
            }
            return;
        }
        if (!((event.type === 'input' && !isSelect) || (event.type === 'change' && isSelect))) return;
        var columnSetting = target.dataset.listColumnSetting;
        var statSetting = target.dataset.listStatSetting;
        if (target.dataset.listRowSource !== undefined && !isPlaytest()) {
            dispatch({
                type: 'update-list-row-source',
                id: target.dataset.moduleId,
                column: Number(target.dataset.column),
                row: Number(target.dataset.listRowSource),
                value: target.value
            });
            return;
        }
        if ((columnSetting || statSetting) && !isPlaytest()) {
            var columnValue = columnSetting === 'options'
                ? target.value.split(/\r?\n/).map(function (option) { return option.trim(); }).filter(Boolean)
                : target.value;
            dispatch(columnSetting ? {
                type: 'update-list-column',
                id: target.dataset.moduleId,
                index: Number(target.dataset.index),
                setting: columnSetting,
                value: columnValue,
                render: columnSetting === 'type' || columnSetting === 'source' || columnSetting === 'options'
            } : {
                type: 'update-list-stat',
                id: target.dataset.moduleId,
                index: Number(target.dataset.index),
                setting: statSetting,
                value: target.value,
                render: false
            });
            updateLiveValues(studio, state, api);
            return;
        }
        var setting = target.dataset.setting;
        if (setting && !isPlaytest()) {
            var selected = findModule(state.document.modules, state.ui.selectedId);
            if (!selected) return;
            var inPlace = setting === 'name' || numericSettings.includes(setting);
            var rerender = !inPlace || setting === 'groupColumns';
            dispatch({ type: 'update-setting', id: selected.id, setting: setting, value: target.value, render: rerender });
            if (setting === 'name') {
                var title = studio.querySelector('[data-sheet-module="' + selected.id + '"] [data-module-title]');
                if (title) title.textContent = target.value || moduleTypes[selected.type].name;
            } else if (inPlace && !rerender) {
                updateLiveValues(studio, state, api);
            }
            return;
        }
        if (target.dataset.choiceSetting && !isPlaytest()) {
            var optionRow = target.closest('[data-choice-index]');
            dispatch({
                type: 'update-choice',
                id: optionRow.dataset.moduleId,
                index: Number(optionRow.dataset.choiceIndex),
                setting: target.dataset.choiceSetting,
                value: target.value
            });
            return;
        }
        if (target.dataset.lookupEntries && !isPlaytest()) {
            var entries = [];
            var invalid = false;
            target.value.split(/\r?\n/).filter(function (line) { return line.trim(); }).forEach(function (line) {
                var parts = line.split('=');
                var input = Number(parts[0]);
                var output = Number(parts[1]);
                if (parts.length !== 2 || !Number.isFinite(input) || !Number.isFinite(output)) {
                    invalid = true;
                    return;
                }
                entries.push({ input: input, output: output });
            });
            target.setCustomValidity(invalid ? 'Enter one numeric input=output pair per line.' : '');
            if (invalid) return;
            var lookupModule = findModule(state.document.modules, target.dataset.lookupEntries);
            if (lookupModule) {
                dispatch({
                    type: 'update-setting',
                    id: lookupModule.id,
                    setting: 'lookupEntries',
                    value: entries,
                    render: false
                });
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

    function openSaveDialog() {
        var dialog = studio.querySelector('[data-save-dialog]');
        studio.querySelector('[data-save-error]').hidden = true;
        dialog.showModal();
        studio.querySelector('#sheet-name').focus();
    }

    async function saveAction(event) {
        event.preventDefault();
        var name = studio.querySelector('#sheet-name').value.trim();
        var description = studio.querySelector('#sheet-description').value.trim();
        var privacyLevel = Number(studio.querySelector('#template-level').value);
        var errorMessage = studio.querySelector('[data-save-error]');
        errorMessage.hidden = true;
        dispatch({ type: 'update-document-meta', key: 'name', value: name, render: false });
        dispatch({ type: 'update-document-meta', key: 'description', value: description, render: false });
        var problems = validate(state.document);
        if (problems.length) {
            errorMessage.textContent = problems.join(' ');
            errorMessage.hidden = false;
            return;
        }

        var saveButton = studio.querySelector('[data-confirm-save]');
        saveButton.disabled = true;
        var meta = document.querySelector('meta[name="csrf-token"]');
        var token = studio.dataset.csrfToken || (meta && meta.content);
        try {
            var result = await save(
                state.document,
                studio.dataset.saveUrl,
                token,
                privacyLevel,
                studio.dataset.templateId
            );
            window.location.assign('/templates/' + result.templateId);
        } catch (error) {
            console.error('Template builder save failed:', error);
            errorMessage.textContent = error.message || 'The template could not be saved.';
            errorMessage.hidden = false;
        } finally {
            saveButton.disabled = false;
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
        var groupTab = event.target.closest('[data-page-tab]');
        if (groupTab) {
            var tabs = Array.prototype.slice.call(groupTab.parentElement.querySelectorAll('[data-page-tab]'));
            var index = tabs.indexOf(groupTab);
            var nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length :
                event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length :
                    event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : index;
            if (nextIndex !== index) {
                event.preventDefault();
                tabs[nextIndex].click();
            }
            return;
        }
        if (state.ui.mode !== 'developer') return;
        var editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
        if (editing) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            deleteSelected();
        }
    }

    function handleFocusout(event) {
        var cell = event.target.closest('[data-list-cell]');
        if (!cell || state.ui.mode !== 'playtest') return;
        var module = findModule(state.document.modules, cell.dataset.listCell);
        var column = module && module.columns[Number(cell.dataset.column)];
        if (column && column.type === 'dice' && cell.value.trim()) {
            window.setTimeout(refresh, 0);
        }
    }

    /* start the builder */
    // load the last draft, then draw the sheet.
    function attachListeners() {
        studio.addEventListener('click', handleClick);
        studio.addEventListener('input', handleInputs);
        studio.addEventListener('change', handleInputs);
        studio.addEventListener('focusout', handleFocusout);
        studio.addEventListener('keydown', handleKeydown);
        if (window.ResizeObserver) {
            var canvasObserver = new window.ResizeObserver(function () {
                if (updateResponsiveColumns()) refresh();
            });
            canvasObserver.observe(rootCanvas);
        } else {
            window.addEventListener('resize', function () {
                if (updateResponsiveColumns()) refresh();
            });
        }
        if (playerSheet) return;

        studio.addEventListener('pointerdown', startPointer);
        studio.addEventListener('pointermove', movePointer);
        ['pointerup', 'pointercancel'].forEach(function (type) {
            studio.addEventListener(type, function (event) { finishPointer(event, type === 'pointercancel'); });
        });
        studio.querySelector('[data-download-template]').addEventListener('click', downloadTemplate);
        studio.querySelector('[data-save-template]').addEventListener('click', openSaveDialog);
        studio.querySelector('[data-save-form]').addEventListener('submit', saveAction);
        studio.querySelector('[data-cancel-save]').addEventListener('click', function () {
            studio.querySelector('[data-save-dialog]').close();
        });
        var draftDialog = studio.querySelector('[data-draft-dialog]');
        if (draftDialog) {
            studio.querySelector('[data-continue-draft]').addEventListener('click', continueDraft);
            studio.querySelector('[data-start-fresh]').addEventListener('click', startFresh);
        }
    }

    try {
        var hasInitialTemplate = Boolean(studio.dataset.initialTemplate);
        var saved = hasInitialTemplate ? JSON.parse(studio.dataset.initialTemplate) : restore();
        if (saved && Array.isArray(saved.modules)) {
            if (!playerSheet && !hasInitialTemplate && saved.modules.length) {
                pendingDraft = saved;
            } else {
                dispatch({ type: 'restore-document', document: saved, recordHistory: false, render: false });
                setDocumentFields();
            }
        }
    } catch (error) {
        console.error('Template builder draft restore failed:', error);
        window.alert('The saved draft could not be restored.');
    }
    if (!playerSheet) {
        studio.querySelector('#template-level').value = studio.dataset.privacyLevel || '0';
    }
    attachListeners();
    if (!playerSheet) renderSavedPresets(studio, state.document.savedPresets);
    refresh();
    if (pendingDraft) studio.querySelector('[data-draft-dialog]').showModal();
}