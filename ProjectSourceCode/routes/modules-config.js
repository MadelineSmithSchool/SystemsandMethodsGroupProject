// lists module types and starter presets, the main file uses these to add modules to the sheet.
import { clone, flatten, linkSettings } from './modules-helper.js';

export var moduleSize = { colSpan: 4, rowSpan: 3 };

var base = { value: '', source: '', visibility: 'shown', modifiers: [], children: [] };

function withBase(extra) {
    return Object.assign(clone(base), extra);
}

export var moduleTypes = {
    number: {
        name: 'Number', control: 'number', valueKind: 'number',
        inspector: ['source', 'value', 'conditional'],
        defaults: withBase({ value: '10' })
    },
    text: {
        name: 'Text', control: 'text', valueKind: 'input',
        inspector: ['source'], defaults: withBase()
    },
    dice: {
        name: 'Dice', control: 'dice', valueKind: 'dice', inspector: ['dice'],
        defaults: withBase({
            count: 1, countSource: '', sides: 20, sidesSource: '',
            keepHighest: 0, keepHighestSource: '', bonusSource: ''
        })
    },
    checkbox: {
        name: 'Checkbox', control: 'checkbox', valueKind: 'checkbox',
        inspector: ['source', 'checkbox'],
        defaults: withBase({ checked: false, uncheckedValue: 0, checkedValue: 1 })
    },
    notes: {
        name: 'Notes', control: 'notes', valueKind: 'input',
        inspector: ['source'], defaults: withBase()
    },
    math: {
        name: 'Math', control: 'math', valueKind: 'math', inspector: ['math'],
        defaults: withBase({
            visibility: 'hidden', mathOperation: 'add', mathRounding: 'none',
            leftValue: 0, leftSource: '', rightValue: 0, rightSource: ''
        })
    },
    group: {
        name: 'Group', control: 'group', valueKind: 'group',
        inspector: ['group'], defaults: withBase()
    }
};

function tile(id, type, name, col, row, extra) {
    return Object.assign({ id: id, type: type, name: name, col: col, row: row }, moduleSize, extra);
}

export var builtinPresets = {
    'ability-check': [
        tile('check', 'checkbox', 'Proficient', 1, 1),
        tile('modifier', 'number', 'Ability modifier', 5, 1, {
            value: '0', modifiers: [{ source: 'check', amount: 2 }]
        }),
        tile('roll', 'dice', 'Ability check', 9, 1, { bonusSource: 'modifier' })
    ],
    'advantage-attack': [
        tile('check', 'checkbox', 'Proficient', 1, 1),
        tile('modifier', 'number', 'Attack modifier', 5, 1, {
            value: '0', modifiers: [{ source: 'check', amount: 2 }]
        }),
        tile('roll', 'dice', 'Attack roll', 9, 1, { count: 2, keepHighest: 1, bonusSource: 'modifier' })
    ],
    'ability-score-bonus': [
        tile('level', 'number', 'level', 1, 1),
        tile('subtract', 'math', 'subtract 10', 5, 1, {
            leftSource: 'level', rightValue: 10, mathOperation: 'subtract'
        }),
        tile('divide', 'math', 'divide', 9, 1, {
            leftSource: 'subtract', rightValue: 2, mathOperation: 'divide', mathRounding: 'down'
        }),
        tile('bonus', 'number', 'Ability Bonus', 1, 4, { source: 'divide', value: '' })
    ]
};

export function clonePresetModules(presetModules, firstId) {
    var copies = clone(presetModules);
    var idMap = {};
    var next = firstId;
    flatten(copies).forEach(function (module) {
        Object.assign(module, Object.assign(clone(moduleTypes[module.type].defaults), module));
        idMap[module.id] = String(next);
        module.id = String(next);
        next += 1;
    });
    flatten(copies).forEach(function (module) {
        linkSettings.forEach(function (setting) {
            if (module[setting]) module[setting] = idMap[module[setting]] || '';
        });
        module.modifiers = module.modifiers
            .filter(function (item) { return idMap[item.source]; })
            .map(function (item) { return { source: idMap[item.source], amount: item.amount }; });
    });
    return { modules: copies, nextId: next };
}
