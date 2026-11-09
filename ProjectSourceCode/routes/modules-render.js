// draws the sheet and settings, the main file gives it the sheet data and shared helpers.
import { findModule, flatten, layoutColumns } from './modules-helper.js';

var mathSymbols = { add: '+', subtract: '−', multiply: '×', divide: '÷', modulo: '%' };

// make the fields and buttons used on the sheet.
function field(labelText, control) {
    var label = document.createElement('label');
    label.className = 'inspector-field';
    label.append(document.createTextNode(labelText), control);
    return label;
}

function inputControl(type, value, min, max) {
    var control = document.createElement('input');
    control.type = type;
    control.value = value;
    if (min !== undefined) control.min = min;
    if (max !== undefined) control.max = max;
    return control;
}

function selectOptions(select, items, selected, emptyLabel) {
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.appendChild(empty);
    items.forEach(function (item) {
        var option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        option.selected = item.id === selected;
        select.appendChild(option);
    });
}

export function setPlacement(element, module, layout) {
    var columns = layoutColumns(layout);
    var colSpan = Math.min(module.colSpan, columns);
    var col = Math.max(1, Math.min(columns - colSpan + 1, module.col));
    element.style.gridColumn = col + ' / span ' + colSpan;
    element.style.gridRow = module.row + ' / span ' + module.rowSpan;
}

function moduleHidden(module, typeTable) {
    return module.visibility === 'hidden' || (!module.visibility && typeTable[module.type].defaults.visibility === 'hidden');
}

function listCellKey(moduleId, row, column) {
    return moduleId + ':' + row + ':' + column;
}

function createControl(module, doc, player, helpers, typeTable, mode, ui) {
    var body = document.createElement('div');
    body.className = 'module-body';
    var kind = typeTable[module.type].control;

    if (kind === 'list') {
        var list = document.createElement('div');
        list.className = 'list-module';
        var editingList = mode === 'playtest' && Boolean(player.listEditing[module.id]);
        if (mode === 'playtest') {
            var editToggle = document.createElement('button');
            editToggle.type = 'button';
            editToggle.className = 'list-edit-toggle';
            editToggle.dataset.toggleListEdit = module.id;
            editToggle.setAttribute('aria-pressed', String(editingList));
            editToggle.setAttribute('aria-label', (editingList ? 'Finish editing ' : 'Edit ') + module.name);
            editToggle.textContent = editingList ? 'Done' : 'Edit';
            list.appendChild(editToggle);
        }
        var stats = document.createElement('div');
        stats.className = 'list-stats';
        (module.stats || []).forEach(function (stat, index) {
            var statItem = document.createElement('div');
            statItem.className = 'list-stat';
            var statName = document.createElement('span');
            statName.dataset.listStatName = '';
            statName.dataset.moduleId = module.id;
            statName.dataset.index = index;
            var statValue = document.createElement('output');
            statValue.dataset.listStatValue = '';
            statValue.dataset.moduleId = module.id;
            statValue.dataset.index = index;
            statItem.append(statName, statValue);
            stats.appendChild(statItem);
        });
        if (stats.childElementCount) list.appendChild(stats);

        var columns = module.columns || [];
        var tableWrap = document.createElement('div');
        tableWrap.className = 'list-table-wrap';
        var table = document.createElement('table');
        table.className = 'list-table';
        var head = document.createElement('thead');
        var headerRow = document.createElement('tr');
        columns.forEach(function (column, index) {
            var heading = document.createElement('th');
            heading.scope = 'col';
            heading.dataset.listColumnHeader = '';
            heading.dataset.moduleId = module.id;
            heading.dataset.index = index;
            headerRow.appendChild(heading);
        });
        head.appendChild(headerRow);
        table.appendChild(head);
        var tableBody = document.createElement('tbody');
        var rows = module.rows || [];
        if (mode === 'playtest') rows = rows.concat(player.listRows[module.id] || []);
        rows.forEach(function (row, rowIndex) {
            var rowElement = document.createElement('tr');
            columns.forEach(function (column, columnIndex) {
                var cell = document.createElement('td');
                var key = listCellKey(module.id, rowIndex, columnIndex);
                var cellLabel = (column.name || 'Column ' + (columnIndex + 1)) + ', row ' + (rowIndex + 1);
                var cellValue = mode === 'playtest' && player.values[key] !== undefined ?
                    player.values[key] : row.cells && row.cells[columnIndex] !== undefined ? row.cells[columnIndex] : '';
                if (column.type === 'dice' && mode === 'playtest' && !editingList &&
                    (column.source || String(cellValue).trim())) {
                    var formula = document.createElement('button');
                    formula.type = 'button';
                    formula.className = 'dice-roll-trigger list-dice-trigger';
                    formula.dataset.rollListCell = module.id;
                    formula.dataset.row = rowIndex;
                    formula.dataset.column = columnIndex;
                    formula.textContent = column.source ? '' : cellValue;
                    formula.setAttribute('aria-label', 'Roll ' + cellLabel + ': ' + (column.source ? 'linked formula' : cellValue));
                    if (column.source) {
                        formula.dataset.listColumnSource = column.source;
                    }
                    cell.appendChild(formula);
                } else if (column.source) {
                    var linkedValue = document.createElement('output');
                    linkedValue.dataset.listColumnSource = column.source;
                    cell.appendChild(linkedValue);
                } else if (mode === 'playtest' && !editingList) {
                    var valueText = document.createElement('span');
                    valueText.className = 'list-cell-text';
                    valueText.textContent = cellValue;
                    cell.appendChild(valueText);
                } else {
                    var input = document.createElement('input');
                    input.type = column.type === 'number' ? 'number' : 'text';
                    input.value = cellValue;
                    input.dataset.listCell = module.id;
                    input.dataset.row = rowIndex;
                    input.dataset.column = columnIndex;
                    input.setAttribute('aria-label', cellLabel);
                    cell.appendChild(input);
                }
                rowElement.appendChild(cell);
            });
            tableBody.appendChild(rowElement);
        });
        table.appendChild(tableBody);
        tableWrap.appendChild(table);
        list.appendChild(tableWrap);
        if (editingList) {
            var addRow = document.createElement('button');
            addRow.type = 'button';
            addRow.className = 'list-player-add-row';
            addRow.dataset.addPlayerListRow = module.id;
            addRow.textContent = 'Add row';
            list.appendChild(addRow);
        }
        body.appendChild(list);
        return body;
    }

    if (kind === 'group') {
        var children = module.children || [];
        if (mode === 'playtest') {
            children = children.filter(function (child) { return !moduleHidden(child, typeTable); });
        }
        var activeId = ui && ui.activeGroupTabs && ui.activeGroupTabs[module.id];
        var activeChild = children.find(function (child) { return child.id === activeId; }) || children[0];
        var groupHeader = document.createElement('header');
        groupHeader.className = 'group-header';
        var groupTitle = document.createElement('strong');
        groupTitle.dataset.moduleTitle = '';
        groupTitle.textContent = module.name;
        if (mode === 'playtest' && module.hideGroupName) groupTitle.hidden = true;
        var tabs = document.createElement('div');
        tabs.className = 'group-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', module.name + ' items');
        children.forEach(function (child) {
            var tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'group-tab';
            tab.dataset.groupTab = module.id;
            tab.dataset.groupTabMember = child.id;
            tab.id = 'group-tab-' + module.id + '-' + child.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(activeChild === child));
            tab.tabIndex = activeChild === child ? 0 : -1;
            tab.setAttribute('aria-controls', 'group-panel-' + module.id);
            tab.textContent = child.name;
            tabs.appendChild(tab);
        });
        groupHeader.append(groupTitle, tabs);
        if (mode === 'developer') {
            var groupActions = document.createElement('div');
            groupActions.className = 'group-editor-actions';
            var groupMove = document.createElement('button');
            groupMove.type = 'button';
            groupMove.className = 'module-move-handle';
            groupMove.dataset.moveModule = '';
            groupMove.textContent = 'Move';
            groupMove.setAttribute('aria-label', 'Move ' + module.name);
            groupActions.appendChild(groupMove);
            var groupSettings = document.createElement('button');
            groupSettings.type = 'button';
            groupSettings.className = 'module-edit';
            groupSettings.dataset.editModule = module.id;
            groupSettings.textContent = 'Settings';
            groupActions.appendChild(groupSettings);
            var groupRemove = document.createElement('button');
            groupRemove.type = 'button';
            groupRemove.className = 'module-remove';
            groupRemove.dataset.removeModule = module.id;
            groupRemove.textContent = 'Remove';
            groupActions.appendChild(groupRemove);
            groupHeader.appendChild(groupActions);
        }
        body.appendChild(groupHeader);

        var panel = document.createElement('div');
        panel.className = 'group-tab-panel';
        panel.id = 'group-panel-' + module.id;
        panel.dataset.groupDropzone = module.id;
        panel.setAttribute('role', 'tabpanel');
        panel.tabIndex = 0;
        if (activeChild) {
            panel.setAttribute('aria-labelledby', 'group-tab-' + module.id + '-' + activeChild.id);
            if (mode === 'developer') {
                var editChild = document.createElement('button');
                editChild.type = 'button';
                editChild.className = 'group-tab-edit';
                editChild.dataset.editModule = activeChild.id;
                editChild.textContent = 'Edit';
                editChild.setAttribute('aria-label', 'Edit ' + activeChild.name);
                panel.appendChild(editChild);
            }
            var content = createControl(activeChild, doc, player, helpers, typeTable, mode, ui);
            content.classList.add('group-tab-content');
            if (mode === 'developer') {
                var childSummary = document.createElement('p');
                childSummary.className = 'module-dev-summary';
                childSummary.textContent = typeTable[activeChild.type].control === 'dice' ?
                    'Roll output' : activeChild.source ? 'Linked input' : 'Player input';
                panel.appendChild(childSummary);
            }
            panel.appendChild(content);
        } else {
            var emptyMessage = document.createElement('p');
            emptyMessage.className = 'group-empty-state';
            emptyMessage.textContent = mode === 'developer' ?
                'Add a tab in Module settings, or drag a module here.' : 'No items in this group.';
            panel.appendChild(emptyMessage);
        }
        body.appendChild(panel);
        return body;
    }

    if (kind === 'math') {
        var calculation = document.createElement('output');
        calculation.className = 'math-result';
        calculation.dataset.mathResult = module.id;
        body.appendChild(calculation);
        return body;
    }

    if (kind === 'dice') {
        var formula = document.createElement('button');
        formula.className = 'dice-formula';
        formula.dataset.diceFormula = module.id;
        formula.textContent = helpers.diceFormula(module);
        formula.type = 'button';
        formula.classList.add('dice-roll-trigger');
        formula.dataset.rollModule = module.id;
        formula.setAttribute('aria-label', 'Roll ' + module.name + ': ' + formula.textContent);
        body.appendChild(formula);
        return body;
    }

    if (module.source) {
        // show the linked value instead of asking for another entry.
        var output = document.createElement('output');
        output.className = 'module-output';
        output.dataset.sourceValue = module.id;
        body.appendChild(output);
        return body;
    }

    if (kind === 'checkbox') {
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = mode === 'playtest' ? Boolean(player.checked[module.id]) : Boolean(module.checked);
        checkbox.dataset.moduleChecked = module.id;
        checkbox.setAttribute('aria-label', module.name);
        body.appendChild(checkbox);
        return body;
    }

    var input = kind === 'notes' ? document.createElement('textarea') : document.createElement('input');
    if (kind !== 'notes') input.type = kind === 'number' ? 'number' : 'text';
    input.value = mode === 'playtest' && player.values[module.id] !== undefined ?
        player.values[module.id] : (module.value || '');
    input.placeholder = kind === 'notes' ? 'Write notes' : kind === 'number' ? '0' : 'Enter text';
    input.dataset.moduleValue = module.id;
    input.setAttribute('aria-label', module.name);
    body.appendChild(input);
    if (kind === 'number') {
        var effective = document.createElement('output');
        effective.className = 'number-effective';
        effective.dataset.effectiveNumber = module.id;
        body.appendChild(effective);
    }
    return body;
}

function drawModules(layout, list, root, doc, player, helpers, typeTable, mode, ui, emptyState) {
    // show hidden modules while editing, but leave them out of playtest.
    var visible = mode === 'playtest' ? list.filter(function (module) { return !moduleHidden(module, typeTable); }) : list;
    visible.forEach(function (module) {
        var card = document.createElement('article');
        card.className = [
            'sheet-module',
            ui && module.id === ui.selectedId ? 'is-selected' : '',
            ui && ui.selectedModuleIds.includes(module.id) ? 'is-multi-selected' : '',
            moduleHidden(module, typeTable) ? 'is-hidden' : ''
        ].filter(Boolean).join(' ');
        card.dataset.sheetModule = module.id;
        card.dataset.moduleType = module.type;
        setPlacement(card, module, layout);
        if (module.type === 'list') {
            var addedPlayerRows = mode === 'playtest' ? (player.listRows[module.id] || []).length : 0;
            card.style.gridRow = module.row + ' / span ' + (module.rowSpan + addedPlayerRows);
        }

        if (module.type !== 'group') {
            var header = document.createElement('header');
            header.className = 'sheet-module-header';
            if (mode === 'developer') {
                var move = document.createElement('button');
                move.type = 'button';
                move.className = 'module-move-handle';
                move.dataset.moveModule = '';
                move.textContent = 'Move';
                move.setAttribute('aria-label', 'Move ' + module.name);
                header.appendChild(move);
            }
            var title = document.createElement('strong');
            title.dataset.moduleTitle = '';
            title.textContent = module.name;
            header.appendChild(title);
            if (mode === 'developer') {
                var edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'module-edit';
                edit.dataset.editModule = module.id;
                edit.textContent = 'Edit';
                header.appendChild(edit);
                var remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'module-remove';
                remove.dataset.removeModule = module.id;
                remove.textContent = 'Remove';
                header.appendChild(remove);
            }
            card.appendChild(header);
        }

        if (mode === 'developer' && typeTable[module.type].control !== 'group') {
            var summary = document.createElement('p');
            summary.className = 'module-dev-summary';
            summary.textContent = typeTable[module.type].control === 'dice' ? 'Roll output' : module.source ? 'Linked input' : 'Player input';
            card.appendChild(summary);
        }
        card.appendChild(createControl(module, doc, player, helpers, typeTable, mode, ui));

        if (mode === 'developer') {
            var resize = document.createElement('button');
            resize.type = 'button';
            resize.className = 'module-resize-handle';
            resize.dataset.resizeModule = '';
            resize.setAttribute('aria-label', 'Resize ' + module.name);
            card.appendChild(resize);
        }
        layout.appendChild(card);
    });
    if (root && emptyState) emptyState.hidden = visible.length > 0;
}

export function updateLiveValues(studio, state, helpers) {
    var doc = state.document;
    var ui = state.ui;
    var player = state.player;
    var modulesById = new Map();
    flatten(doc.modules).forEach(function (module) {
        if (!modulesById.has(module.id)) modulesById.set(module.id, module);
    });
    // update linked values and results without redrawing the whole sheet.
    studio.querySelectorAll('[data-module-value]').forEach(function (input) {
        if (input !== document.activeElement) {
            var value = ui.mode === 'playtest' ? player.values[input.dataset.moduleValue] : undefined;
            var module = modulesById.get(input.dataset.moduleValue);
            input.value = value !== undefined ? value : module && module.value || '';
        }
    });
    studio.querySelectorAll('[data-source-value]').forEach(function (output) {
        output.textContent = String(helpers.resolveValue(output.dataset.sourceValue));
    });
    studio.querySelectorAll('[data-effective-number]').forEach(function (output) {
        output.textContent = 'Effective: ' + helpers.resolveValue(output.dataset.effectiveNumber);
    });
    studio.querySelectorAll('[data-list-cell]').forEach(function (input) {
        var module = modulesById.get(input.dataset.listCell);
        if (!module || input === document.activeElement) return;
        var rowIndex = Number(input.dataset.row);
        var rows = ui.mode === 'playtest' ?
            (module.rows || []).concat(player.listRows[module.id] || []) : module.rows || [];
        var row = rows[rowIndex];
        var columnIndex = Number(input.dataset.column);
        var column = module.columns[columnIndex];
        var value = row && row.cells && row.cells[columnIndex];
        var key = listCellKey(input.dataset.listCell, input.dataset.row, columnIndex);
        var displayValue = ui.mode === 'playtest' && player.values[key] !== undefined ? player.values[key] : value;
        input.value = displayValue == null ? '' : displayValue;
        input.setAttribute('aria-label', (column && column.name || 'Column ' + (columnIndex + 1)) +
            ', row ' + (Number(input.dataset.row) + 1));
    });
    studio.querySelectorAll('[data-list-column-header]').forEach(function (heading) {
        var module = modulesById.get(heading.dataset.moduleId);
        var index = Number(heading.dataset.index);
        heading.textContent = module && module.columns[index] && module.columns[index].name ||
            'Column ' + (index + 1);
    });
    studio.querySelectorAll('[data-list-stat-name]').forEach(function (name) {
        var module = modulesById.get(name.dataset.moduleId);
        var index = Number(name.dataset.index);
        name.textContent = module && module.stats[index] && module.stats[index].name || 'Stat';
    });
    studio.querySelectorAll('[data-list-stat-value]').forEach(function (output) {
        var module = modulesById.get(output.dataset.moduleId);
        var index = Number(output.dataset.index);
        var stat = module && module.stats[index];
        var value = stat && (stat.source ? helpers.resolveValue(stat.source) : stat.value);
        output.textContent = value == null ? '' : String(value);
    });
    studio.querySelectorAll('[data-list-column-source]').forEach(function (output) {
        output.textContent = String(helpers.resolveValue(output.dataset.listColumnSource));
    });
    studio.querySelectorAll('[data-dice-formula]').forEach(function (formula) {
        var module = modulesById.get(formula.dataset.diceFormula);
        if (module) formula.textContent = helpers.diceFormula(module);
    });
    studio.querySelectorAll('[data-math-result]').forEach(function (output) {
        var module = modulesById.get(output.dataset.mathResult);
        if (!module) return;
        var result = helpers.calculateMath(module);
        if (!Number.isFinite(result.result)) {
            output.textContent = result.error || 'Invalid input';
            return;
        }
        output.textContent = result.left + ' ' + (mathSymbols[module.mathOperation] || '+') + ' ' +
            result.right + ' = ' + result.result;
    });
}

export function renderCanvas(studio, state, helpers) {
    var doc = state.document;
    var ui = state.ui;
    var player = state.player;
    var typeTable = helpers.types;
    var rootCanvas = studio.querySelector('[data-root-canvas]');
    var emptyState = studio.querySelector('[data-empty-state]');
    rootCanvas.querySelectorAll('[data-sheet-module]').forEach(function (element) { element.remove(); });
    drawModules(rootCanvas, doc.modules, true, doc, player, helpers, typeTable, ui.mode, ui, emptyState);
    var rollOverlay = rootCanvas.querySelector('[data-roll-overlay]');
    if (!rollOverlay) {
        rollOverlay = document.createElement('output');
        rollOverlay.className = 'dice-roll-overlay';
        rollOverlay.dataset.rollOverlay = '';
        rollOverlay.setAttribute('aria-live', 'polite');
        rootCanvas.appendChild(rollOverlay);
    }
    var lastRoll = player.lastRoll;
    rollOverlay.hidden = !lastRoll;
    if (lastRoll) {
        var detail = lastRoll.error ? lastRoll.error :
            (lastRoll.rolls || []).join(', ') + ' = ' + lastRoll.total;
        if (lastRoll.kept && lastRoll.keepHighest) {
            detail = (lastRoll.rolls || []).join(', ') + ' (kept ' + lastRoll.kept.join(', ') + ') = ' + lastRoll.total;
        }
        rollOverlay.textContent = [lastRoll.name, lastRoll.formula, detail].filter(Boolean).join(' · ');
    }
    // update values after the sheet changes or a roll is made.
    updateLiveValues(studio, state, helpers);
}

export function renderInspector(studio, state, helpers) {
    var doc = state.document;
    var ui = state.ui;
    var typeTable = helpers.types;
    var inspector = studio.querySelector('[data-inspector]');
    inspector.replaceChildren();
    var module = findModule(doc.modules, ui.selectedId);
    if (!module) {
        var empty = document.createElement('p');
        empty.className = 'studio-muted';
        empty.textContent = 'Select Edit on a module to change its settings and inputs.';
        inspector.appendChild(empty);
        return;
    }

    function settingInput(label, setting, value, min, max) {
        var input = inputControl(typeof value === 'number' ? 'number' : 'text', value, min, max);
        input.dataset.setting = setting;
        inspector.appendChild(field(label, input));
        return input;
    }

    function settingSelect(label, items, selected, emptyLabel, setting) {
        var select = document.createElement('select');
        selectOptions(select, items, selected, emptyLabel);
        select.dataset.setting = setting;
        inspector.appendChild(field(label, select));
    }

    var config = typeTable[module.type];
    var nameInput = settingInput('Module name', 'name', module.name);
    nameInput.maxLength = 40;
    settingSelect('Module visibility', [
        { id: 'shown', name: 'Shown' },
        { id: 'hidden', name: 'Hidden' }
    ], module.visibility || config.defaults.visibility, 'Choose visibility', 'visibility');

    // let this module use another value module as its input.
    var candidates = flatten(doc.modules).filter(function (item) {
        return item.type !== 'group' && item.type !== 'list' && item.id !== module.id;
    });
    candidates = candidates.concat(flatten(doc.modules).filter(function (item) {
        return item.type === 'list' && item.id !== module.id;
    }).map(function (item) {
        return { id: item.id + '.length', name: item.name + '.length', type: 'list-length' };
    }));

    if (config.inspector.includes('source')) {
        settingSelect('Input from', candidates, module.source, 'Player enters this value', 'source');
    }
    if (config.inspector.includes('value') && !module.source) {
        settingInput('Starting value', 'value', Number(module.value || 0));
    }
    if (config.inspector.includes('checkbox') && !module.source) {
        settingInput('Value when not checked', 'uncheckedValue', module.uncheckedValue);
        settingInput('Value when checked', 'checkedValue', module.checkedValue);
    }
    if (config.inspector.includes('conditional')) {
        var heading = document.createElement('strong');
        heading.textContent = 'Conditional changes';
        inspector.appendChild(heading);
        var help = document.createElement('p');
        help.className = 'studio-muted';
        help.textContent = 'Change this value when a checkbox is on.';
        inspector.appendChild(help);
        (module.modifiers || []).forEach(function (modifier, index) {
            var row = document.createElement('div');
            row.className = 'module-modifier';
            row.dataset.modifierIndex = index;
            row.dataset.moduleId = module.id;
            var checkbox = document.createElement('select');
            selectOptions(checkbox, flatten(doc.modules).filter(function (item) { return item.type === 'checkbox'; }), modifier.source, 'Choose a checkbox');
            checkbox.dataset.modifierSetting = 'source';
            var amount = inputControl('number', modifier.amount, -99, 99);
            amount.dataset.modifierSetting = 'amount';
            row.append(field('When checked', checkbox), field('Change by', amount));
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn module-modifier-remove';
            remove.dataset.removeModifier = index;
            remove.textContent = 'Remove';
            row.appendChild(remove);
            inspector.appendChild(row);
        });
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn module-add-modifier';
        add.dataset.addModifier = module.id;
        add.textContent = 'Add checkbox change';
        inspector.appendChild(add);
    }
    if (config.inspector.includes('dice')) {
        settingInput('Number of dice', 'count', module.count, 1, 100);
        settingInput('Die sides', 'sides', module.sides, 2, 1000);
        settingInput('Keep highest', 'keepHighest', module.keepHighest, 0, 100);
        settingSelect('Count from', candidates, module.countSource, 'Fixed dice count', 'countSource');
        settingSelect('Sides from', candidates, module.sidesSource, 'Fixed die sides', 'sidesSource');
        settingSelect('Keep highest from', candidates, module.keepHighestSource, 'Use fixed keep highest', 'keepHighestSource');
        settingSelect('Add number value', candidates, module.bonusSource, 'No bonus', 'bonusSource');
    }
    if (config.inspector.includes('math')) {
        ['left', 'right'].forEach(function (side) {
            settingInput(side === 'left' ? 'First value' : 'Second value', side + 'Value', module[side + 'Value']);
            settingSelect((side === 'left' ? 'First' : 'Second') + ' value from', candidates, module[side + 'Source'], 'Use fixed value', side + 'Source');
        });
        var operation = document.createElement('select');
        [
            ['add', 'Add (+)'], ['subtract', 'Subtract (-)'], ['multiply', 'Multiply (×)'],
            ['divide', 'Divide (÷)'], ['modulo', 'Modulo (%)']
        ].forEach(function (item) {
            var option = document.createElement('option');
            option.value = item[0];
            option.textContent = item[1];
            option.selected = item[0] === module.mathOperation;
            operation.appendChild(option);
        });
        operation.dataset.setting = 'mathOperation';
        inspector.appendChild(field('Operation', operation));
        if (module.mathOperation === 'divide') {
            var rounding = document.createElement('select');
            [['none', 'Do not round'], ['up', 'Round up'], ['down', 'Round down']].forEach(function (item) {
                var option = document.createElement('option');
                option.value = item[0];
                option.textContent = item[1];
                option.selected = item[0] === module.mathRounding;
                rounding.appendChild(option);
            });
            rounding.dataset.setting = 'mathRounding';
            inspector.appendChild(field('Rounding', rounding));
        }
    }
    if (config.inspector.includes('group')) {
        var hint = document.createElement('p');
        hint.className = 'studio-muted';
        hint.textContent = 'Each tab holds one module. Set the shared tab area size here, or drag an existing module into it.';
        inspector.appendChild(hint);

        var hideNameLabel = document.createElement('label');
        hideNameLabel.className = 'inspector-field group-hide-name-field';
        var hideName = document.createElement('input');
        hideName.type = 'checkbox';
        hideName.checked = Boolean(module.hideGroupName);
        hideName.dataset.setting = 'hideGroupName';
        hideNameLabel.append(hideName, document.createTextNode('Hide group name in Playtest'));
        inspector.appendChild(hideNameLabel);

        var tabsHeading = document.createElement('strong');
        tabsHeading.textContent = 'Tabs';
        inspector.appendChild(tabsHeading);
        (module.children || []).forEach(function (child) {
            var tabRow = document.createElement('div');
            tabRow.className = 'group-setting-tab';
            var tabName = document.createElement('span');
            tabName.textContent = child.name;
            var removeTab = document.createElement('button');
            removeTab.type = 'button';
            removeTab.className = 'list-setting-remove';
            removeTab.dataset.ungroupModule = child.id;
            removeTab.textContent = 'Remove tab';
            tabRow.append(tabName, removeTab);
            inspector.appendChild(tabRow);
        });

        settingInput('Tab width (columns)', 'colSpan', module.colSpan, 1, 12);
        settingInput('Tab height (rows)', 'rowSpan', module.rowSpan, 1, 12);

        var addTabRow = document.createElement('div');
        addTabRow.className = 'group-add-tab';
        var moduleType = document.createElement('select');
        moduleType.setAttribute('aria-label', 'Module type for new tab');
        moduleType.dataset.groupModuleType = module.id;
        Object.keys(typeTable).filter(function (type) { return type !== 'group'; })
            .forEach(function (type) {
                var option = document.createElement('option');
                option.value = type;
                option.textContent = typeTable[type].name;
                moduleType.appendChild(option);
            });
        var addTab = document.createElement('button');
        addTab.type = 'button';
        addTab.className = 'btn';
        addTab.dataset.addGroupTab = module.id;
        addTab.textContent = 'Add tab';
        addTabRow.append(moduleType, addTab);
        inspector.appendChild(addTabRow);

        var dropzone = document.createElement('div');
        dropzone.className = 'group-settings-dropzone';
        dropzone.dataset.groupDropzone = module.id;
        dropzone.textContent = 'Drop an existing module here to move it into this group.';
        inspector.appendChild(dropzone);
    }
    if (config.inspector.includes('list')) {
        var listHelp = document.createElement('p');
        listHelp.className = 'studio-muted';
        listHelp.textContent = 'Configure column values and sources here. Add entries in Playtest or fill cells on the canvas.';
        inspector.appendChild(listHelp);

        var columnsHeading = document.createElement('strong');
        columnsHeading.textContent = 'Columns';
        inspector.appendChild(columnsHeading);
        (module.columns || []).forEach(function (column, index) {
            var section = document.createElement('div');
            section.className = 'list-setting-row';
            var name = inputControl('text', column.name);
            name.maxLength = 32;
            name.dataset.listColumnSetting = 'name';
            name.dataset.moduleId = module.id;
            name.dataset.index = index;
            var type = document.createElement('select');
            [['text', 'Text'], ['number', 'Number'], ['dice', 'Dice']].forEach(function (item) {
                var option = document.createElement('option');
                option.value = item[0];
                option.textContent = item[1];
                option.selected = item[0] === column.type;
                type.appendChild(option);
            });
            type.dataset.listColumnSetting = 'type';
            type.dataset.moduleId = module.id;
            type.dataset.index = index;
            var source = document.createElement('select');
            selectOptions(source, candidates, column.source || '', 'Player enters this value');
            source.dataset.listColumnSetting = 'source';
            source.dataset.moduleId = module.id;
            source.dataset.index = index;
            section.append(field('Column header', name), field('Column value', type), field('Input from', source));
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn list-setting-remove';
            remove.dataset.listAction = 'remove-list-column';
            remove.dataset.moduleId = module.id;
            remove.dataset.index = index;
            remove.textContent = 'Remove column';
            remove.disabled = module.columns.length <= 1;
            section.appendChild(remove);
            inspector.appendChild(section);
        });
        var addColumn = document.createElement('button');
        addColumn.type = 'button';
        addColumn.className = 'btn list-setting-add';
        addColumn.dataset.listAction = 'add-list-column';
        addColumn.dataset.moduleId = module.id;
        addColumn.textContent = 'Add column';
        inspector.appendChild(addColumn);

        var rowsHeading = document.createElement('strong');
        rowsHeading.textContent = 'Rows';
        inspector.appendChild(rowsHeading);
        var rowControls = document.createElement('div');
        rowControls.className = 'list-row-controls';
        var addRow = document.createElement('button');
        addRow.type = 'button';
        addRow.className = 'btn list-setting-add';
        addRow.dataset.listAction = 'add-list-row';
        addRow.dataset.moduleId = module.id;
        addRow.textContent = 'Add row';
        rowControls.appendChild(addRow);
        var removeRow = document.createElement('button');
        removeRow.type = 'button';
        removeRow.className = 'btn list-setting-remove';
        removeRow.dataset.listAction = 'remove-list-row';
        removeRow.dataset.moduleId = module.id;
        removeRow.dataset.index = (module.rows || []).length - 1;
        removeRow.textContent = 'Remove last row';
        removeRow.disabled = (module.rows || []).length <= 1;
        rowControls.appendChild(removeRow);
        inspector.appendChild(rowControls);

        var statsHeading = document.createElement('strong');
        statsHeading.textContent = 'Top stats (optional)';
        inspector.appendChild(statsHeading);
        (module.stats || []).forEach(function (stat, index) {
            var section = document.createElement('div');
            section.className = 'list-setting-row';
            var statName = inputControl('text', stat.name);
            statName.maxLength = 32;
            statName.dataset.listStatSetting = 'name';
            statName.dataset.moduleId = module.id;
            statName.dataset.index = index;
            var statValue = inputControl('text', stat.value);
            statValue.placeholder = 'Fixed value';
            statValue.dataset.listStatSetting = 'value';
            statValue.dataset.moduleId = module.id;
            statValue.dataset.index = index;
            var source = document.createElement('select');
            selectOptions(source, candidates.filter(function (candidate) { return candidate.type !== 'list'; }),
                stat.source, 'Use fixed value', 'source');
            source.dataset.listStatSetting = 'source';
            source.dataset.moduleId = module.id;
            source.dataset.index = index;
            section.append(field('Stat label', statName), field('Fixed value', statValue), field('Show value from', source));
            var removeStat = document.createElement('button');
            removeStat.type = 'button';
            removeStat.className = 'btn list-setting-remove';
            removeStat.dataset.listAction = 'remove-list-stat';
            removeStat.dataset.moduleId = module.id;
            removeStat.dataset.index = index;
            removeStat.textContent = 'Remove stat';
            section.appendChild(removeStat);
            inspector.appendChild(section);
        });
        var addStat = document.createElement('button');
        addStat.type = 'button';
        addStat.className = 'btn list-setting-add';
        addStat.dataset.listAction = 'add-list-stat';
        addStat.dataset.moduleId = module.id;
        addStat.textContent = 'Add top stat';
        inspector.appendChild(addStat);
    }
}

export function renderSavedPresets(studio, presets) {
    var list = studio.querySelector('[data-preset-list]');
    list.querySelectorAll('[data-saved-preset]').forEach(function (button) { button.remove(); });
    presets.forEach(function (preset, index) {
        var button = document.createElement('button');
        button.className = 'module-preset';
        button.type = 'button';
        button.dataset.savedPreset = index;
        button.textContent = preset.name;
        list.appendChild(button);
    });
}

export function updatePresetSelection(studio, ui) {
    var count = ui.selectedModuleIds.length;
    studio.querySelector('[data-preset-selection]').textContent = count ?
        count + (count === 1 ? ' module selected.' : ' modules selected.') :
        'Select modules by dragging across the canvas.';
    studio.querySelector('[data-save-preset]').disabled = count === 0;
    studio.querySelectorAll('[data-sheet-module]').forEach(function (element) {
        element.classList.toggle('is-multi-selected', ui.selectedModuleIds.includes(element.dataset.sheetModule));
    });
}
