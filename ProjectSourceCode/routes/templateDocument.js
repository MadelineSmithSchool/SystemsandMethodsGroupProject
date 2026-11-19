function migrateLegacyGroupModules(modules, parentType) {
  return (modules || []).map((module) => {
    const type = module.type === 'group'
      ? parentType === 'pages' ? 'group' : 'pages'
      : module.type;
    return {
      ...module,
      type,
      groupColumns: type === 'group' ? module.groupColumns || 6 : module.groupColumns,
      children: migrateLegacyGroupModules(module.children, type)
    };
  });
}

function toBuilderDocument(template, isStudioTemplate) {
  if (isStudioTemplate) {
    return {
      schemaVersion: 2,
      name: template.name.trim(),
      description: template.description || '',
      modules: template.modules,
      canvases: template.canvases,
      sheetColors: template.sheetColors
    };
  }

  const stats = Object.entries(template.stats).concat(Object.entries(template.minorStats || {}));
  return {
    schemaVersion: 2,
    name: template.name.trim(),
    description: template.description || '',
    modules: stats.map(([name, value], index) => ({
      id: String(index + 1),
      type: 'number',
      name,
      col: (index % 3) * 4 + 1,
      row: Math.floor(index / 3) * 3 + 1,
      colSpan: 4,
      rowSpan: 3,
      value: String(value),
      source: '',
      visibility: 'shown',
      modifiers: [],
      children: []
    }))
  };
}

function templateDocument(template) {
  const data = template.template_data || {};
  if (data.schemaVersion >= 1 && Array.isArray(data.modules)) {
    return {
      schemaVersion: 2,
      name: template.template_name,
      description: template.template_desc || '',
      modules: data.schemaVersion === 1 ? migrateLegacyGroupModules(data.modules) : data.modules,
      canvases: data.canvases,
      sheetColors: data.sheetColors
    };
  }
  return toBuilderDocument({
    ...data,
    name: template.template_name,
    description: template.template_desc || ''
  }, false);
}

module.exports = { migrateLegacyGroupModules, templateDocument, toBuilderDocument };
