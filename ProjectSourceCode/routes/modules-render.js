// draws the sheet and settings, the main file gives it the sheet data and shared helpers.
import { findModule, flatten, layoutColumns, listCellKey } from './modules-helper.js';

var mathSymbols = { add: '+', subtract: '−', multiply: '×', divide: '÷', modulo: '%' };

// DOM helpers
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

function createButton(text, className, dataset, ariaLabel) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    Object.assign(btn.dataset, dataset || {});
    return btn;
}

function createSelect(dataset, ariaLabel) {
    var sel = document.createElement('select');
    Object.assign(sel.dataset, dataset || {});
    if (ariaLabel) sel.setAttribute('aria-label', ariaLabel);
    return sel;
}

function createInput(type, value, dataset, ariaLabel, opts) {
    var inp = document.createElement('input');
    inp.type = type;
    inp.value = value;
    Object.assign(inp.dataset, dataset || {});
    if (ariaLabel) inp.setAttribute('aria-label', ariaLabel);
    if (opts) {
        if (opts.min !== undefined) inp.min = opts.min;
        if (opts.max !== undefined) inp.max = opts.max;
        if (opts.placeholder) inp.placeholder = opts.placeholder;
        if (opts.maxLength) inp.maxLength = opts.maxLength;
    }
    return inp;
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

<<<<<<< HEAD
function listCellSource(column, rowIndex) {
    return column.rowSources && column.rowSources[rowIndex] || column.source || '';
=======
function listCellKey(moduleId, row, column) {
    return moduleId + ':' + row + ':' + column;
>>>>>>> 1648d7d (added list module)
}

// List rendering helpers
function renderListStats(list, module) {
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
}

function renderListHeaders(module) {
    var head = document.createElement('thead');
    var headerRow = document.createElement('tr');
    (module.columns || []).forEach(function (column, index) {
        var heading = document.createElement('th');
        heading.scope = 'col';
        heading.dataset.listColumnHeader = '';
        heading.dataset.moduleId = module.id;
        heading.dataset.index = index;
        headerRow.appendChild(heading);
    });
    head.appendChild(headerRow);
    return head;
}

function renderListCell(column, columnIndex, row, rowIndex, module, player, mode) {
    var cell = document.createElement('td');
    var key = listCellKey(module.id, rowIndex, columnIndex);
    var cellLabel = (column.name || 'Column ' + (columnIndex + 1)) + ', row ' + (rowIndex + 1);
    var cellSource = listCellSource(column, rowIndex);
    var cellValue = mode === 'playtest' && player.values[key] !== undefined ?
        player.values[key] : row.cells && row.cells[columnIndex] !== undefined ? row.cells[columnIndex] : '';
    var editingList = mode === 'playtest' && Boolean(player.listEditing[module.id]);

    if (column.type === 'dice' && mode === 'playtest' && !editingList && (cellSource || String(cellValue).trim())) {
        cell.appendChild(createButton(cellSource ? '' : cellValue, 'dice-roll-trigger list-dice-trigger',
            { rollListCell: module.id, row: rowIndex, column: columnIndex, ...(cellSource && { listColumnSource: cellSource }) },
            'Roll ' + cellLabel + ': ' + (cellSource ? 'linked formula' : cellValue)));
    } else if (cellSource) {
        var linkedValue = document.createElement('output');
        linkedValue.dataset.listColumnSource = cellSource;
        cell.appendChild(linkedValue);
    } else if (column.type === 'checkbox') {
        var checkbox = createInput('checkbox', 'on', { listCell: module.id, row: rowIndex, column: columnIndex }, cellLabel);
        checkbox.checked = cellValue === true || cellValue === 'true' || cellValue === '1' || cellValue === 'on';
        cell.appendChild(checkbox);
    } else if (column.type === 'choice') {
        var choice = createSelect({ listCell: module.id, row: rowIndex, column: columnIndex }, cellLabel);
        var blankOption = document.createElement('option');
        blankOption.value = '';
        blankOption.textContent = 'Choose';
        choice.appendChild(blankOption);
        (column.options || []).forEach(function (optionValue) {
            var option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            choice.appendChild(option);
        });
        choice.value = cellValue == null ? '' : String(cellValue);
        cell.appendChild(choice);
    } else if (mode === 'playtest' && !editingList) {
        var valueText = document.createElement('span');
        valueText.className = 'list-cell-text';
        valueText.textContent = cellValue;
        cell.appendChild(valueText);
    } else {
        cell.appendChild(createInput(column.type === 'number' ? 'number' : 'text', cellValue == null ? '' : String(cellValue),
            { listCell: module.id, row: rowIndex, column: columnIndex }, cellLabel));
    }
    return cell;
}

function renderListRows(module, player, mode) {
    var tableBody = document.createElement('tbody');
    var rows = module.rows || [];
    if (mode === 'playtest') rows = rows.concat(player.listRows[module.id] || []);
    rows.forEach(function (row, rowIndex) {
        var rowElement = document.createElement('tr');
        (module.columns || []).forEach(function (column, columnIndex) {
            rowElement.appendChild(renderListCell(column, columnIndex, row, rowIndex, module, player, mode));
        });
        tableBody.appendChild(rowElement);
    });
    return tableBody;
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

    if (kind === 'pages') {
        var children = module.children || [];
        if (mode === 'playtest') {
            children = children.filter(function (child) { return !moduleHidden(child, typeTable); });
        }
        var activeId = ui && ui.activeGroupTabs && ui.activeGroupTabs[module.id];
        var activeChild = children.find(function (child) { return child.id === activeId; }) || children[0];
        var groupHeader = document.createElement('header');
        groupHeader.className = 'pages-header';
        var groupTitle = document.createElement('strong');
        groupTitle.dataset.moduleTitle = '';
        groupTitle.textContent = module.name;
        if (mode === 'playtest' && module.hideGroupName) groupTitle.hidden = true;
        var tabs = document.createElement('div');
        tabs.className = 'pages-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', module.name + ' pages');
        children.forEach(function (child) {
            var tab = createButton(child.name, 'pages-tab', { pageTab: module.id, pageTabMember: child.id });
            tab.id = 'page-tab-' + module.id + '-' + child.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(activeChild === child));
            tab.tabIndex = activeChild === child ? 0 : -1;
            tab.setAttribute('aria-controls', 'page-panel-' + module.id);
            tabs.appendChild(tab);
        });
        groupHeader.append(groupTitle, tabs);
        if (mode === 'developer') {
            var groupActions = document.createElement('div');
            groupActions.className = 'group-editor-actions';
            groupActions.appendChild(createButton('Move', 'module-move-handle', { moveModule: '' }, 'Move ' + module.name));
            groupActions.appendChild(createButton('Settings', 'module-edit', { editModule: module.id }));
            groupActions.appendChild(createButton('Remove', 'module-remove', { removeModule: module.id }));
            groupHeader.appendChild(groupActions);
        }
        body.appendChild(groupHeader);

        var panel = document.createElement('div');
        panel.className = 'pages-panel';
        panel.id = 'page-panel-' + module.id;
        panel.dataset.pagesDropzone = module.id;
        panel.setAttribute('role', 'tabpanel');
        panel.tabIndex = 0;
        if (activeChild) {
            panel.setAttribute('aria-labelledby', 'page-tab-' + module.id + '-' + activeChild.id);
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
                'Add a page in Module settings, or drag a module here.' : 'No pages in this sheet.';
            panel.appendChild(emptyMessage);
        }
        body.appendChild(panel);
        return body;
    }

    if (kind === 'group') {
        var grid = document.createElement('div');
        grid.className = 'group-field-grid';
        grid.dataset.layoutCanvas = '';
        grid.dataset.groupDropzone = module.id;
        grid.style.setProperty('--layout-columns', String(Math.max(1, Math.min(6, Number(module.groupColumns) || 2))));
        grid.setAttribute('role', 'group');
        grid.setAttribute('aria-label', module.name + ' fields');
        var emptyState = document.createElement('p');
        emptyState.className = 'group-empty-state';
        emptyState.textContent = mode === 'developer' ?
            'Add fields in Module settings or drag them into this panel.' : 'No fields in this panel.';
        grid.appendChild(emptyState);
        drawModules(grid, module.children || [], false, doc, player, helpers, typeTable, mode, ui, emptyState, true);
        body.appendChild(grid);
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
<<<<<<< HEAD
        var diceText = helpers.diceFormula(module);
        body.appendChild(createButton(diceText, 'dice-formula dice-roll-trigger',
            { diceFormula: module.id, rollModule: module.id }, 'Roll ' + module.name + ': ' + diceText));
=======
        var formula = document.createElement('button');
        formula.className = 'dice-formula';
        formula.dataset.diceFormula = module.id;
        formula.textContent = helpers.diceFormula(module);
        formula.type = 'button';
        formula.classList.add('dice-roll-trigger');
        formula.dataset.rollModule = module.id;
        formula.setAttribute('aria-label', 'Roll ' + module.name + ': ' + formula.textContent);
        body.appendChild(formula);
>>>>>>> 1648d7d (added list module)
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
        var checkbox = createInput('checkbox', 'on', { moduleChecked: module.id }, module.name);
        checkbox.checked = mode === 'playtest' ? Boolean(player.checked[module.id]) : Boolean(module.checked);
        body.appendChild(checkbox);
        return body;
    }

    var value = mode === 'playtest' && player.values[module.id] !== undefined ?
        player.values[module.id] : (module.value || '');
    if (kind === 'choice') {
        var choiceControl = createSelect({ moduleValue: module.id }, module.name);
        var emptyChoice = document.createElement('option');
        emptyChoice.value = '';
        emptyChoice.textContent = 'Choose an option';
        choiceControl.appendChild(emptyChoice);
        (module.choices || []).forEach(function (choice) {
            var option = document.createElement('option');
            option.value = choice.source;
            option.textContent = choice.label;
            choiceControl.appendChild(option);
        });
        choiceControl.value = value;
        body.appendChild(choiceControl);
        return body;
    }
    var valueContainer = body;
    var editingValue = mode !== 'playtest' || Boolean(player.valueEditing[module.id]);
    if (mode === 'playtest') {
        valueContainer = document.createElement('div');
        valueContainer.className = 'value-module';
        var btn = createButton(editingValue ? 'Done' : 'Edit', 'list-edit-toggle',
            { toggleValueEdit: module.id }, (editingValue ? 'Finish editing ' : 'Edit ') + module.name);
        btn.setAttribute('aria-pressed', String(editingValue));
        valueContainer.appendChild(btn);
        if (!editingValue) {
            var valueText = document.createElement('span');
            valueText.className = 'module-value-text';
            valueText.textContent = value;
            valueContainer.appendChild(valueText);
        }
        body.appendChild(valueContainer);
    }

    if (editingValue) {
        var input = kind === 'notes' ? document.createElement('textarea') : document.createElement('input');
        if (kind !== 'notes') input.type = kind === 'number' ? 'number' : 'text';
        input.value = value;
        input.dataset.moduleValue = module.id;
        input.setAttribute('aria-label', module.name);
        input.placeholder = kind === 'notes' ? 'Write notes' : kind === 'number' ? '0' : 'Enter text';
        valueContainer.appendChild(input);
    }
    return body;
}

function drawModules(layout, list, root, doc, player, helpers, typeTable, mode, ui, emptyState, compactFields) {
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
<<<<<<< HEAD
=======
        }

        var header = document.createElement('header');
        header.className = 'sheet-module-header';
        var move = document.createElement('button');
        move.type = 'button';
        move.className = 'module-move-handle';
        move.dataset.moveModule = '';
        move.textContent = 'Move';
        move.setAttribute('aria-label', 'Move ' + module.name);
        var title = document.createElement('strong');
        title.dataset.moduleTitle = '';
        title.textContent = module.name;
        header.append(move, title);
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
>>>>>>> 1648d7d (added list module)
        }

        if (module.type !== 'pages' && !compactFields) {
            var header = document.createElement('header');
            header.className = 'sheet-module-header';
            if (mode === 'developer') {
                header.appendChild(createButton('Move', 'module-move-handle', { moveModule: '' }, 'Move ' + module.name));
            }
            var title = document.createElement('strong');
            title.dataset.moduleTitle = '';
            title.textContent = module.name;
            header.appendChild(title);
            if (mode === 'developer') {
                header.appendChild(createButton('Edit', 'module-edit', { editModule: module.id }));
                header.appendChild(createButton('Remove', 'module-remove', { removeModule: module.id }));
            }
            card.appendChild(header);
        } else if (compactFields && module.type !== 'pages') {
            var fieldLabel = document.createElement('div');
            fieldLabel.className = 'group-field-label';
            var fieldName = document.createElement('span');
            fieldName.textContent = module.name;
            fieldLabel.appendChild(fieldName);
            if (mode === 'developer') {
                var fieldActions = document.createElement('div');
                fieldActions.className = 'group-field-actions';
                fieldActions.appendChild(createButton('Move', 'module-move-handle', { moveModule: '' }, 'Move ' + module.name));
                fieldActions.appendChild(createButton('Edit', 'module-edit', { editModule: module.id }));
                fieldLabel.appendChild(fieldActions);
            }
            card.appendChild(fieldLabel);
        }

        if (mode === 'developer' && !compactFields && typeTable[module.type].control !== 'group') {
            var summary = document.createElement('p');
            summary.className = 'module-dev-summary';
            summary.textContent = typeTable[module.type].control === 'dice' ? 'Roll output' : module.source ? 'Linked input' : 'Player input';
            card.appendChild(summary);
        }
        card.appendChild(createControl(module, doc, player, helpers, typeTable, mode, ui));

        if (mode === 'developer') {
            card.appendChild(createButton('', 'module-resize-handle', { resizeModule: '' }, 'Resize ' + module.name));
        }
        layout.appendChild(card);
        if (root && module.type === 'group') {
            var groupGrid = card.querySelector('.group-field-grid');
            if (groupGrid) {
                var canvasStyle = getComputedStyle(layout);
                var rowHeight = parseFloat(canvasStyle.gridAutoRows) || 64;
                var rowGap = parseFloat(canvasStyle.rowGap) || 0;
                var headerHeight = card.querySelector('.sheet-module-header').getBoundingClientRect().height;
                var contentHeight = Math.max(groupGrid.scrollHeight, groupGrid.getBoundingClientRect().height) +
                    headerHeight + 12;
                var contentRows = Math.ceil(contentHeight / (rowHeight + rowGap));
                card.style.gridRow = module.row + ' / span ' + Math.max(module.rowSpan, contentRows);
                card.style.overflow = 'hidden';
            }
        }
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
        if (column && column.type === 'checkbox') {
            input.checked = displayValue === true || displayValue === 'true' ||
                displayValue === '1' || displayValue === 'on';
        } else {
            input.value = displayValue == null ? '' : displayValue;
        }
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
    studio.querySelectorAll('[data-list-cell]').forEach(function (input) {
        var module = findModule(doc.modules, input.dataset.listCell);
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
        var module = findModule(doc.modules, heading.dataset.moduleId);
        var index = Number(heading.dataset.index);
        heading.textContent = module && module.columns[index] && module.columns[index].name ||
            'Column ' + (index + 1);
    });
    studio.querySelectorAll('[data-list-stat-name]').forEach(function (name) {
        var module = findModule(doc.modules, name.dataset.moduleId);
        var index = Number(name.dataset.index);
        name.textContent = module && module.stats[index] && module.stats[index].name || 'Stat';
    });
    studio.querySelectorAll('[data-list-stat-value]').forEach(function (output) {
        var module = findModule(doc.modules, output.dataset.moduleId);
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
        if (module.mathOperation === 'abilityModifier') {
            output.textContent = 'Modifier (' + result.left + ') = ' + result.result;
        } else if (module.mathOperation === 'proficiencyBonus') {
            output.textContent = 'Proficiency (' + result.left + ') = ' + result.result;
        } else if (module.mathOperation === 'minimum' || module.mathOperation === 'maximum') {
            output.textContent = module.mathOperation + '(' + result.left + ', ' + result.right + ') = ' + result.result;
        } else if (module.mathOperation === 'lookup') {
            output.textContent = 'Lookup (' + result.left + ') = ' + result.result;
        } else {
            output.textContent = result.left + ' ' + (mathSymbols[module.mathOperation] || '+') + ' ' +
                result.right + ' = ' + result.result;
        }
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
<<<<<<< HEAD
        return ['number', 'checkbox', 'math', 'choice'].includes(item.type) && item.id !== module.id;
=======
        return item.type !== 'group' && item.type !== 'list' && item.id !== module.id;
>>>>>>> 1648d7d (added list module)
    });
    candidates = candidates.concat(flatten(doc.modules).filter(function (item) {
        return item.type === 'list' && item.id !== module.id;
    }).map(function (item) {
        return { id: item.id + '.length', name: item.name + '.length', type: 'list-length' };
    }));
<<<<<<< HEAD
    var listCellCandidates = [];
    flatten(doc.modules).filter(function (item) {
        return item.type === 'list' && item.id !== module.id;
    }).forEach(function (item) {
        (item.columns || []).forEach(function (column, columnIndex) {
            if (!['number', 'checkbox'].includes(column.type)) return;
            (item.rows || []).forEach(function (_, rowIndex) {
                var id = item.id + '.' + (rowIndex + 1) + '.' + (columnIndex + 1);
                listCellCandidates.push({
                    id: id,
                    name: item.name + ' · row ' + (rowIndex + 1) + ' · ' + column.name,
                    type: 'list-cell'
                });
            });
        });
    });
    candidates = candidates.concat(listCellCandidates);
=======
>>>>>>> 1648d7d (added list module)

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
        var operation = createSelect({ setting: 'mathOperation' });
        var mathOps = [
            ['add', 'Add (+)'], ['subtract', 'Subtract (-)'], ['multiply', 'Multiply (×)'],
            ['divide', 'Divide (÷)'], ['modulo', 'Modulo (%)'],
            ['minimum', 'Minimum'], ['maximum', 'Maximum'],
            ['abilityModifier', 'Ability modifier from score'],
            ['proficiencyBonus', 'Proficiency bonus from level'],
            ['lookup', 'Lookup table']
        ];
        mathOps.forEach(function (item) {
            var option = document.createElement('option');
            option.value = item[0];
            option.textContent = item[1];
            option.selected = item[0] === module.mathOperation;
            operation.appendChild(option);
        });
        inspector.appendChild(field('Operation', operation));
        if (module.mathOperation === 'lookup') {
            var lookupInput = document.createElement('textarea');
            lookupInput.rows = 5;
            lookupInput.dataset.lookupEntries = module.id;
            lookupInput.value = (module.lookupEntries || []).map(function (entry) {
                return entry.input + '=' + entry.output;
            }).join('\n');
            inspector.appendChild(field('Lookup values (input=output, one per line)', lookupInput));
        }
        if (module.mathOperation === 'divide') {
            var rounding = createSelect({ setting: 'mathRounding' });
            [['none', 'Do not round'], ['up', 'Round up'], ['down', 'Round down']].forEach(function (item) {
                var option = document.createElement('option');
                option.value = item[0];
                option.textContent = item[1];
                option.selected = item[0] === module.mathRounding;
                rounding.appendChild(option);
            });
            inspector.appendChild(field('Rounding', rounding));
        }
    }
    if (config.inspector.includes('pages')) {
        var hint = document.createElement('p');
        hint.className = 'studio-muted';
        hint.textContent = 'Pages provide a tabbed view. Each tab can contain a field, list, or compact group.';
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
        tabsHeading.textContent = 'Pages';
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
            removeTab.textContent = 'Remove page';
            tabRow.append(tabName, removeTab);
            inspector.appendChild(tabRow);
        });

        settingInput('Page width (columns)', 'colSpan', module.colSpan, 1, 12);
        settingInput('Page height (rows)', 'rowSpan', module.rowSpan, 1, 12);

        var addTabRow = document.createElement('div');
        addTabRow.className = 'group-add-tab';
        var moduleType = createSelect({ pagesModuleType: module.id }, 'Module type for new tab');
        Object.keys(typeTable).filter(function (type) { return type !== 'pages'; })
            .forEach(function (type) {
                var option = document.createElement('option');
                option.value = type;
                option.textContent = typeTable[type].name;
                moduleType.appendChild(option);
            });
        addTabRow.append(moduleType, createButton('Add page', 'btn', { addPage: module.id }));
        inspector.appendChild(addTabRow);

        var dropzone = document.createElement('div');
        dropzone.className = 'group-settings-dropzone';
        dropzone.dataset.pagesDropzone = module.id;
        dropzone.textContent = 'Drop an existing field or group here to make it a page.';
        inspector.appendChild(dropzone);
    }
    if (config.inspector.includes('group')) {
        var groupHint = document.createElement('p');
        groupHint.className = 'studio-muted';
        groupHint.textContent = 'Arrange related inputs together. Fields flow into a compact grid; use a List for repeatable rows.';
        inspector.appendChild(groupHint);

        settingInput('Field columns', 'groupColumns', module.groupColumns || 2, 1, 6);

        var fieldsHeading = document.createElement('strong');
        fieldsHeading.textContent = 'Fields';
        inspector.appendChild(fieldsHeading);
        (module.children || []).forEach(function (child) {
            var fieldRow = document.createElement('div');
            fieldRow.className = 'group-setting-tab';
            var fieldName = document.createElement('span');
            fieldName.textContent = child.name;
            var removeField = document.createElement('button');
            removeField.type = 'button';
            removeField.className = 'list-setting-remove';
            removeField.dataset.ungroupModule = child.id;
            removeField.textContent = 'Remove field';
            fieldRow.append(fieldName, removeField);
            inspector.appendChild(fieldRow);
        });

        var addFieldRow = document.createElement('div');
        addFieldRow.className = 'group-add-tab';
        var fieldType = createSelect({ groupFieldType: module.id }, 'Module type for new group field');
        Object.keys(typeTable).filter(function (type) {
            return !['pages', 'group'].includes(type);
        }).forEach(function (type) {
            var option = document.createElement('option');
            option.value = type;
            option.textContent = typeTable[type].name;
            fieldType.appendChild(option);
        });
        addFieldRow.append(fieldType, createButton('Add field', 'btn', { addGroupField: module.id }));
        inspector.appendChild(addFieldRow);

        var groupDropzone = document.createElement('div');
        groupDropzone.className = 'group-settings-dropzone';
        groupDropzone.dataset.groupDropzone = module.id;
        groupDropzone.textContent = 'Drop an existing field here to move it into this group.';
        inspector.appendChild(groupDropzone);
    }
    if (config.inspector.includes('choice')) {
        var choiceHelp = document.createElement('p');
        choiceHelp.className = 'studio-muted';
        choiceHelp.textContent = 'Each option returns the linked numeric value. Use this to let players choose an ability or other stat.';
        inspector.appendChild(choiceHelp);
        (module.choices || []).forEach(function (choice, index) {
            var row = document.createElement('div');
            row.className = 'module-choice-option';
            row.dataset.choiceIndex = index;
            row.dataset.moduleId = module.id;
            var labelInput = createInput('text', choice.label || '', { choiceSetting: 'label' }, '', { maxLength: 40 });
            var source = createSelect({ choiceSetting: 'source' });
            selectOptions(source, candidates, choice.source || '', 'Choose a value');
            row.append(field('Option label', labelInput), field('Value from', source),
                createButton('Remove', 'btn list-setting-remove', { removeChoice: index }));
            inspector.appendChild(row);
        });
        inspector.appendChild(createButton('Add option', 'btn list-setting-add', { addChoice: module.id }));
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
            var dataset = { listColumnSetting: 'name', moduleId: module.id, index: index };
            var name = createInput('text', column.name, dataset, '', { maxLength: 32 });
            var type = createSelect({ listColumnSetting: 'type', moduleId: module.id, index: index });
            [['text', 'Text'], ['number', 'Number'], ['dice', 'Dice'],
                ['checkbox', 'Checkbox'], ['choice', 'Choice']].forEach(function (item) {
                var option = document.createElement('option');
                option.value = item[0];
                option.textContent = item[1];
                option.selected = item[0] === column.type;
                type.appendChild(option);
            });
            var source = createSelect({ listColumnSetting: 'source', moduleId: module.id, index: index });
            selectOptions(source, candidates, column.source || '', 'Player enters this value');
            section.append(field('Column header', name), field('Column value', type), field('Input from', source));
            if (column.type === 'choice') {
                var options = document.createElement('textarea');
                options.value = (column.options || []).join('\n');
                options.rows = 3;
                options.dataset.listColumnSetting = 'options';
                options.dataset.moduleId = module.id;
                options.dataset.index = index;
                section.appendChild(field('Choices (one per line)', options));
            }
            (module.rows || []).forEach(function (_, rowIndex) {
                var rowSource = createSelect({
                    listRowSource: rowIndex,
                    moduleId: module.id,
                    column: index
                });
                selectOptions(rowSource, candidates, column.rowSources && column.rowSources[rowIndex] || '',
                    'Use column source or player input');
                section.appendChild(field('Row ' + (rowIndex + 1) + ' value from', rowSource));
            });
            var remove = createButton('Remove column', 'btn list-setting-remove',
                { listAction: 'remove-list-column', moduleId: module.id, index: index });
            remove.disabled = module.columns.length <= 1;
            section.appendChild(remove);
            inspector.appendChild(section);
        });
        inspector.appendChild(createButton('Add column', 'btn list-setting-add',
            { listAction: 'add-list-column', moduleId: module.id }));

        var rowsHeading = document.createElement('strong');
        rowsHeading.textContent = 'Rows';
        inspector.appendChild(rowsHeading);
        var rowControls = document.createElement('div');
        rowControls.className = 'list-row-controls';
        rowControls.appendChild(createButton('Add row', 'btn list-setting-add',
            { listAction: 'add-list-row', moduleId: module.id }));
        var removeRow = createButton('Remove last row', 'btn list-setting-remove',
            { listAction: 'remove-list-row', moduleId: module.id, index: (module.rows || []).length - 1 });
        removeRow.disabled = (module.rows || []).length <= 1;
        rowControls.appendChild(removeRow);
        inspector.appendChild(rowControls);

        var statsHeading = document.createElement('strong');
        statsHeading.textContent = 'Top stats (optional)';
        inspector.appendChild(statsHeading);
        (module.stats || []).forEach(function (stat, index) {
            var section = document.createElement('div');
            section.className = 'list-setting-row';
            var dataset = { listStatSetting: 'name', moduleId: module.id, index: index };
            var statName = createInput('text', stat.name, dataset, '', { maxLength: 32 });
            var dataset2 = { listStatSetting: 'value', moduleId: module.id, index: index };
            var statValue = createInput('text', stat.value, dataset2, '', { placeholder: 'Fixed value' });
            var source = createSelect({ listStatSetting: 'source', moduleId: module.id, index: index });
            selectOptions(source, candidates.filter(function (c) { return c.type !== 'list'; }),
                stat.source, 'Use fixed value');
            section.append(field('Stat label', statName), field('Fixed value', statValue), field('Show value from', source),
                createButton('Remove stat', 'btn list-setting-remove',
                    { listAction: 'remove-list-stat', moduleId: module.id, index: index }));
            inspector.appendChild(section);
        });
        inspector.appendChild(createButton('Add top stat', 'btn list-setting-add',
            { listAction: 'add-list-stat', moduleId: module.id }));
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
