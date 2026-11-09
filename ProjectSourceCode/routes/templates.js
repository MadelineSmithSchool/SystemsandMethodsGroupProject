// upload + send templates
const express = require('express'); 
const multer = require('multer');
const crypto = require('crypto');

const upload = multer({ limits: { fileSize: 1024 * 1024 } }); // 1 MB max, kept in memory
const moduleTypes = new Set(['number', 'text', 'dice', 'checkbox', 'notes', 'math', 'group', 'list']);

function renderTemplateError(res, status, title, message, returnUrl = '/templates') {
  return res.status(status).render('pages/error', {
    errorCode: status,
    errorTitle: title,
    errorMessage: message,
    returnUrl
  });
}

function renderNotFound(res) {
  return renderTemplateError(
    res,
    404,
    'Template not found',
    'This template does not exist or you do not have permission to view it.'
  );
}

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
      modules: template.modules
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

// returns an error message if the uploaded template is wrong, otherwise null
function checkLegacyTemplate(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'File must be a JSON object.';
  if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 50) return 'Template needs a name (50 characters max).';
  if (t.description && (typeof t.description !== 'string' || t.description.length > 255)) return 'Description must be text (255 characters max).';
  for (const group of ['stats', 'minorStats']) {
    const stats = t[group];
    if (group === 'minorStats' && stats === undefined) continue;
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return `"${group}" must be stat names with numbers.`;
    if (Object.values(stats).some((v) => typeof v !== 'number')) return `Every value in "${group}" must be a number.`;
  }
  if (Object.keys(t.stats).length === 0) return 'Template needs at least one stat.';
  return null;
}

function checkStudioTemplate(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'File must be a JSON object.';
  if (![1, 2].includes(t.schemaVersion)) return 'Template has an unsupported format.';
  if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 50) return 'Template needs a name (50 characters max).';
  if (t.description !== undefined && (typeof t.description !== 'string' || t.description.length > 255)) return 'Description must be text (255 characters max).';
  if (!Array.isArray(t.modules) || t.modules.length === 0) return 'Template needs at least one module.';

  const ids = new Set();
  const modulesById = new Map();
  function checkModules(modules) {
    for (const module of modules) {
      if (!module || typeof module !== 'object' || Array.isArray(module)) return 'Every module must be an object.';
      if (!moduleTypes.has(module.type)) return 'Template contains an unsupported module type.';
      if ((typeof module.id !== 'string' && typeof module.id !== 'number') || !String(module.id)) return 'Every module needs an ID.';
      if (ids.has(String(module.id))) return 'Module IDs must be unique.';
      ids.add(String(module.id));
      modulesById.set(String(module.id), module);
      if (typeof module.name !== 'string' || !module.name.trim()) return 'Every module needs a name.';
      if (['col', 'row', 'colSpan', 'rowSpan'].some((key) => !Number.isInteger(module[key]) || module[key] < 1)) {
        return 'Every module needs a valid position and size.';
      }
      if (module.children !== undefined && !Array.isArray(module.children)) return 'Module children must be a list.';
      if (module.modifiers !== undefined && !Array.isArray(module.modifiers)) return 'Module modifiers must be a list.';
      if (Array.isArray(module.modifiers) && module.modifiers.some((modifier) => !modifier || typeof modifier !== 'object' || Array.isArray(modifier))) {
        return 'Every module modifier must be an object.';
      }
      if (module.type === 'list') {
        if (!Array.isArray(module.columns) || module.columns.length === 0 ||
          module.columns.some((column) => !column || typeof column.name !== 'string' ||
            !['text', 'number', 'dice'].includes(column.type) ||
            (column.source !== undefined && typeof column.source !== 'string'))) {
          return 'Every list needs columns with a valid name, value type, and input source.';
        }
        if (!Array.isArray(module.rows) ||
          module.rows.some((row) => !row || !Array.isArray(row.cells) || row.cells.length !== module.columns.length)) {
          return 'Every list row must have a value for each column.';
        }
        if (module.stats !== undefined && (!Array.isArray(module.stats) ||
          module.stats.some((stat) => !stat || typeof stat.name !== 'string' ||
            (stat.source !== undefined && typeof stat.source !== 'string')))) {
          return 'Every list stat must have a valid name and input source.';
        }
      }
      if (module.children) {
        const error = checkModules(module.children || []);
        if (error) return error;
      }
    }
    return null;
  }
  const structureError = checkModules(t.modules);
  if (structureError) return structureError;

  const sources = [];
  function collectSources(modules) {
    for (const module of modules) {
      for (const key of ['source', 'countSource', 'sidesSource', 'keepHighestSource', 'bonusSource', 'leftSource', 'rightSource']) {
        if (module[key]) sources.push(module[key]);
      }
      for (const modifier of module.modifiers || []) if (modifier.source) sources.push(modifier.source);
      for (const choice of module.choices || []) if (choice.source) sources.push(choice.source);
      for (const column of module.columns || []) {
        if (column.source) sources.push(column.source);
        for (const source of column.rowSources || []) if (source) sources.push(source);
      }
      collectSources(module.children || []);
    }
  }
  collectSources(t.modules);
  for (const source of sources) {
    const match = /^(.+)\.(\d+)\.(\d+)$/.exec(String(source));
    if (!match || modulesById.has(source)) continue;
    const list = modulesById.get(match[1]);
    const row = Number(match[2]) - 1;
    const column = Number(match[3]) - 1;
    if (!list || list.type !== 'list' || row < 0 || column < 0 ||
      !Array.isArray(list.rows) || row >= list.rows.length ||
      !Array.isArray(list.columns) || column >= list.columns.length ||
      !['number', 'checkbox'].includes(list.columns[column].type)) {
      return 'A value references a missing or non-numeric list cell.';
    }
  }
  return null;
}

// sends a template back as a .json file (same format as uploads)
function download(res, template) {
  const fileName = template.template_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.attachment(fileName + '.json');
  res.send(JSON.stringify(template.template_data, null, 2));
}

module.exports = (db, auth) => {
  const router = express.Router();
  const editRouter = express.Router();

  router.use((req, res, next) => {
    res.locals.login = !!req.session.user; // for the nav
    next();
  });

  editRouter.get('/:templateid', auth, async (req, res, next) => {
    if (!/^\d{1,9}$/.test(req.params.templateid)) {
      return renderNotFound(res);
    }

    try {
      const template = await db.oneOrNone(
        'SELECT * FROM templates WHERE template_id = $1 AND user_id = $2',
        [req.params.templateid, req.session.user.id]
      );
      if (!template) return renderNotFound(res);

      const data = template.template_data || {};
      const sheet = data.schemaVersion >= 1 && Array.isArray(data.modules)
        ? {
          schemaVersion: 2,
          name: template.template_name,
          description: template.template_desc || '',
          modules: data.schemaVersion === 1 ? migrateLegacyGroupModules(data.modules) : data.modules
        }
        : toBuilderDocument({
          ...data,
          name: template.template_name,
          description: template.template_desc || ''
        }, false);

      res.render('pages/template-builder', {
        initialTemplate: JSON.stringify(sheet),
        templateId: template.template_id,
        privacyLevel: template.privacy_level
      });
    } catch (err) {
      next(err);
    }
  });
  router.edit = editRouter;

  // one of the logged in user's templates (null if it isn't theirs)
  const getMyTemplate = (req, includeSaveCount = false) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return null;
    const saveCount = includeSaveCount
      ? ', (SELECT COUNT(DISTINCT library.user_id) FROM player_library library WHERE library.template_id = templates.template_id AND library.user_id <> templates.user_id) AS times_saved'
      : '';
    return db.oneOrNone(
      `SELECT templates.*${saveCount} FROM templates WHERE template_id = $1 AND user_id = $2`,
      [req.params.id, req.session.user.id]
    );
  };

  const getLibraryTemplate = (req, includeSaveCount = false) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return null;
    const saveCount = includeSaveCount
      ? ', (SELECT COUNT(DISTINCT library.user_id) FROM player_library library WHERE library.template_id = templates.template_id AND library.user_id <> templates.user_id) AS times_saved'
      : '';
    return db.oneOrNone(
      `SELECT templates.*, (templates.user_id = $2) AS is_owner${saveCount}
       FROM templates
       WHERE template_id = $1
         AND (user_id = $2 OR EXISTS (
           SELECT 1 FROM player_library library
           WHERE library.template_id = templates.template_id AND library.user_id = $2
         ))`,
      [req.params.id, req.session.user.id]
    );
  };

  const getShared = (req) => db.oneOrNone(
    'SELECT * FROM templates WHERE share_id = $1 AND privacy_level IN (1, 2)',
    [req.params.shareId]
  );

  const getTemplateList = (userId) => db.any(
    `SELECT t.*, u.username AS creator_name, to_char(t.created_at, 'Mon FMDD, YYYY') AS created_date,
            (t.user_id = $1) AS is_owner
     FROM templates t
     JOIN users u ON u.user_id = t.user_id
     WHERE t.user_id = $1
        OR EXISTS (
          SELECT 1 FROM player_library library
          WHERE library.template_id = t.template_id AND library.user_id = $1
        )
     ORDER BY t.created_at DESC`,
    [userId]
  );

  // list of your templates (pick one to send)
  router.get('/', auth, async (req, res, next) => {
    try {
      const templates = await getTemplateList(req.session.user.id);
      res.render('pages/templates', { templates });
    } catch (err) {
      next(err);
    }
  });

  router.get('/upload', auth, (req, res) => res.render('pages/upload'));
  router.get('/new', auth, (req, res) => {
    const initialTemplate = req.session.uploadedTemplate;
    const templateId = req.session.uploadedTemplateId;
    delete req.session.uploadedTemplate;
    delete req.session.uploadedTemplateId;
    res.render('pages/template-builder', {
      initialTemplate: initialTemplate ? JSON.stringify(initialTemplate) : '',
      templateId: templateId || '',
      privacyLevel: 0
    });
  });

  router.post('/upload', auth, upload.single('template'), async (req, res, next) => {
    const fail = (error) => res.status(400).render('pages/upload', { error });
    if (!req.file) return fail('Pick a file to upload.');

    let template;
    try {
      template = JSON.parse(req.file.buffer.toString());
    } catch (err) {
      return fail('That file is not valid JSON.');
    }

    const studioError = checkStudioTemplate(template);
    const isStudioTemplate = !studioError;
    const error = isStudioTemplate ? null : checkLegacyTemplate(template);
    if (error) return fail(error);

    try {
      const modules = isStudioTemplate && template.schemaVersion === 1
        ? migrateLegacyGroupModules(template.modules)
        : template.modules;
      const data = isStudioTemplate
        ? { schemaVersion: 2, name: template.name.trim(), description: template.description || '', modules }
        : { name: template.name.trim(), description: template.description || '', stats: template.stats, minorStats: template.minorStats || {} };
      const row = await db.tx(async (transaction) => {
        const row = await transaction.one(
          'INSERT INTO templates (template_name, template_desc, template_data, user_id, privacy_level) VALUES ($1, $2, $3:json, $4, 0) RETURNING template_id',
          [data.name, data.description, data, req.session.user.id]
        );
        await transaction.none(
          'INSERT INTO player_library (user_id, template_id) VALUES ($1, $2)',
          [req.session.user.id, row.template_id]
        );
        return row;
      });
      req.session.uploadedTemplate = toBuilderDocument(
        isStudioTemplate ? { ...template, modules } : template,
        isStudioTemplate
      );
      req.session.uploadedTemplateId = row.template_id;
      res.redirect('/templates/new');
    } catch (err) {
      next(err);
    }
  });

  router.post('/save', auth, async (req, res, next) => {
    const template = req.body;
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return res.status(400).json({ error: 'Template data is required.' });
    }
    const templateError = checkStudioTemplate(template);
    if (templateError) return res.status(400).json({ error: templateError });
    if (!Number.isInteger(template.privacyLevel) || ![0, 1, 2].includes(template.privacyLevel)) {
      return res.status(400).json({ error: 'Choose a valid template level.' });
    }
    if (template.templateId !== undefined && !/^\d{1,9}$/.test(String(template.templateId))) {
      return res.status(400).json({ error: 'Template ID is invalid.' });
    }

    try {
      const data = {
        schemaVersion: 2,
        name: template.name.trim(),
        description: template.description || '',
        modules: template.modules
      };
      let savedTemplate;
      if (template.templateId) {
        savedTemplate = await db.oneOrNone(
          `UPDATE templates
           SET template_name = $1, template_desc = $2, template_data = $3:json, privacy_level = $4,
               share_id = CASE WHEN $4 = 0 THEN NULL ELSE share_id END
           WHERE template_id = $5 AND user_id = $6
           RETURNING template_id`,
          [
            data.name,
            data.description,
            data,
            template.privacyLevel,
            template.templateId,
            req.session.user.id
          ]
        );
        if (!savedTemplate) return res.status(404).json({ error: 'Template not found.' });
      } else {
        savedTemplate = await db.tx(async (transaction) => {
          const created = await transaction.one(
            `INSERT INTO templates (template_name, template_desc, template_data, user_id, privacy_level)
             VALUES ($1, $2, $3:json, $4, $5)
             RETURNING template_id`,
            [data.name, data.description, data, req.session.user.id, template.privacyLevel]
          );
          await transaction.none(
            `INSERT INTO player_library (user_id, template_id)
             VALUES ($1, $2)`,
            [req.session.user.id, created.template_id]
          );
          return created;
        });
      }
      res.json({ templateId: savedTemplate.template_id });
    } catch (err) {
      next(err);
    }
  });

  // ---- send (share links). anyone with the link can view it ----

  router.get('/shared/:shareId', async (req, res, next) => {
    try {
      const template = await getShared(req);
      if (!template) return res.status(404).send('This link is invalid.');
      res.render('pages/templates', { sharedTemplate: template });
    } catch (err) {
      next(err);
    }
  });

  router.get('/shared/:shareId/download', async (req, res, next) => {
    try {
      const template = await getShared(req);
      if (!template) return res.status(404).send('This link is invalid.');
      download(res, template);
    } catch (err) {
      next(err);
    }
  });

  // Add the original shared template to the user's library.
  router.post('/shared/:shareId/save', auth, async (req, res, next) => {
    try {
      const template = await getShared(req);
      if (!template) return res.status(404).send('This link is invalid.');
      await db.none(
        `INSERT INTO player_library (user_id, template_id)
         SELECT $1, $2
         WHERE $1 IS DISTINCT FROM $3
           AND NOT EXISTS (
             SELECT 1 FROM player_library
             WHERE user_id = $1 AND template_id = $2
           )`,
        [req.session.user.id, template.template_id, template.user_id]
      );
      res.redirect('/templates/' + template.template_id);
    } catch (err) {
      next(err);
    }
  });

  // ---- your own templates ----

  router.get('/:id', auth, async (req, res, next) => {
    try {
      const template = await getLibraryTemplate(req, true);
      if (!template) return renderNotFound(res);
      const data = template.template_data || {};
      const sheet = data.schemaVersion >= 1 && Array.isArray(data.modules)
        ? {
          schemaVersion: 2,
          name: template.template_name,
          description: template.template_desc || '',
          modules: data.schemaVersion === 1 ? migrateLegacyGroupModules(data.modules) : data.modules
        }
        : toBuilderDocument({
          ...data,
          name: template.template_name,
          description: template.template_desc || ''
        }, false);
      res.render('pages/template', { template, initialTemplate: JSON.stringify(sheet) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/download', auth, async (req, res, next) => {
    try {
      const template = await getLibraryTemplate(req);
      if (!template) return res.status(404).send('Template not found.');
      download(res, template);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/share', auth, async (req, res, next) => {
    try {
      let template = await getMyTemplate(req);
      if (!template) return res.status(404).send('Template not found.');
      if (template.privacy_level === 0) {
        return renderTemplateError(
          res,
          403,
          'Template is private',
          'Change this template to Public or Unlisted before creating a share link.',
          '/templates/' + template.template_id
        );
      }
      // make the link the first time it's shared
      if (!template.share_id) {
        template = await db.one('UPDATE templates SET share_id = $1 WHERE template_id = $2 RETURNING *',
          [crypto.randomBytes(12).toString('hex'), template.template_id]);
      }
      const link = `${req.protocol}://${req.get('host')}/templates/shared/${template.share_id}`;
      const templates = await getTemplateList(req.session.user.id);
      res.render('pages/templates', {
        templates,
        shareLink: link,
        shareTemplateName: template.template_name
      });
    } catch (err) {
      next(err);
    }
  });

  // multer errors (like file too big)
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).render('pages/upload', { error: 'Upload failed: ' + err.message });
    next(err);
  });

  return router;
};
