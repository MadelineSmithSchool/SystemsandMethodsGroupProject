// draws the sheet and settings, the main file gives it the sheet data and shared helpers.
import { findModule, flatten, layoutColumns } from './modules-helper.js';

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

function formatRoll(result) {
    if (!result) return '-';
    if (!result.keepHighest && !result.bonus && result.rolls.length === 1) return String(result.total);
    var text = result.keepHighest ?
        'Rolls: ' + result.rolls.join(', ') + ' (kept ' + result.kept.join(', ') + ')' :
        result.rolls.join(' + ');
    if (result.bonus) text += (result.bonus > 0 ? ' + ' : ' ') + result.bonus;
    return text + ' = ' + result.total;
}

function createControl(module, doc, player, helpers, typeTable, mode) {
    var body = document.createElement('div');
    body.className = 'module-body';
    var kind = typeTable[module.type].control;

    if (kind === 'group') {
        // show group modules inside their own smaller canvas.
        var groupCanvas = document.createElement('div');
        groupCanvas.className = 'group-canvas';
        groupCanvas.dataset.layoutCanvas = '';
        groupCanvas.dataset.groupCanvas = module.id;
        drawModules(groupCanvas, module.children || [], false, doc, player, helpers, typeTable, mode, null, null);
        body.appendChild(groupCanvas);
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
        var formula = document.createElement('p');
        formula.className = 'dice-formula';
        formula.dataset.diceFormula = module.id;
        formula.textContent = helpers.diceFormula(module);
        var rollButton = document.createElement('button');
        rollButton.type = 'button';
        rollButton.className = 'btn dice-roll-button';
        rollButton.dataset.rollModule = module.id;
        rollButton.textContent = 'Roll';
        var result = document.createElement('output');
        result.className = 'dice-result';
        result.textContent = formatRoll(mode === 'playtest' ? player.rollResults[module.id] : null);
        body.append(formula, rollButton, result);
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
        }
        card.appendChild(header);

        if (mode === 'developer' && typeTable[module.type].control !== 'group') {
            var summary = document.createElement('p');
            summary.className = 'module-dev-summary';
            summary.textContent = typeTable[module.type].control === 'dice' ? 'Roll output' : module.source ? 'Linked input' : 'Player input';
            card.appendChild(summary);
        }
        card.appendChild(createControl(module, doc, player, helpers, typeTable, mode));

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
    // update linked values and results without redrawing the whole sheet.
    studio.querySelectorAll('[data-module-value]').forEach(function (input) {
        if (input !== document.activeElement) {
            var value = ui.mode === 'playtest' ? player.values[input.dataset.moduleValue] : undefined;
            var module = findModule(doc.modules, input.dataset.moduleValue);
            input.value = value !== undefined ? value : module && module.value || '';
        }
    });
    studio.querySelectorAll('[data-source-value]').forEach(function (output) {
        output.textContent = String(helpers.resolveValue(output.dataset.sourceValue));
    });
    studio.querySelectorAll('[data-effective-number]').forEach(function (output) {
        output.textContent = 'Effective: ' + helpers.resolveValue(output.dataset.effectiveNumber);
    });
    studio.querySelectorAll('[data-dice-formula]').forEach(function (formula) {
        var module = findModule(doc.modules, formula.dataset.diceFormula);
        if (module) formula.textContent = helpers.diceFormula(module);
    });
    studio.querySelectorAll('[data-math-result]').forEach(function (output) {
        var module = findModule(doc.modules, output.dataset.mathResult);
        if (!module) return;
        var result = helpers.calculateMath(module);
        if (!Number.isFinite(result.result)) {
            output.textContent = result.error || 'Invalid input';
            return;
        }
        var symbols = { add: '+', subtract: '−', multiply: '×', divide: '÷', modulo: '%' };
        output.textContent = result.left + ' ' + symbols[module.mathOperation] + ' ' + result.right + ' = ' + result.result;
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
        return item.type !== 'group' && item.id !== module.id;
    });

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
        module.modifiers.forEach(function (modifier, index) {
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
        hint.textContent = 'Drop other modules inside this group to organize related fields.';
        inspector.appendChild(hint);
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
