const express = require('express');
const { listQuery } = require('../src/listQuery');
const { templateDocument } = require('../src/templateDocument');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function copyPrimitiveRecord(value) {
  if (!isRecord(value)) return null;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'boolean' ||
      typeof entry === 'number' && Number.isFinite(entry)) {
      result[key] = entry;
    } else {
      return null;
    }
  }
  return result;
}

function parsePlayerState(value) {
  let state = value;
  if (typeof state === 'string') {
    try {
      state = JSON.parse(state);
    } catch (err) {
      return null;
    }
  }
  if (!isRecord(state)) return null;

  const values = copyPrimitiveRecord(state.values || {});
  const checked = copyPrimitiveRecord(state.checked || {});
  if (!values || !checked || !isRecord(state.listRows || {})) return null;

  const listRows = {};
  for (const [key, rows] of Object.entries(state.listRows || {})) {
    if (!Array.isArray(rows) || rows.some((row) =>
      !isRecord(row) || !Array.isArray(row.cells) ||
      row.cells.some((cell) => !['string', 'boolean', 'number'].includes(typeof cell)))) {
      return null;
    }
    listRows[key] = rows.map((row) => ({
      ...(typeof row.id === 'string' || typeof row.id === 'number' ? { id: row.id } : {}),
      cells: row.cells
    }));
  }
  return { values, checked, listRows };
}

module.exports = (db) => {
  const router = express.Router();

  async function findTemplate(templateId, userId, allowPublic = false) {
    if (!/^\d{1,9}$/.test(String(templateId))) return null;
    return db.oneOrNone(
      `SELECT templates.*, (templates.user_id = $2) AS is_owner
       FROM templates
       WHERE template_id = $1
         AND (user_id = $2 OR EXISTS (
           SELECT 1 FROM player_library library
           WHERE library.template_id = templates.template_id AND library.user_id = $2
         ) OR ($3 AND privacy_level = 1))`,
      [templateId, userId, allowPublic]
    );
  }

  function renderError(res, status, message, returnUrl = '/characters') {
    return res.status(status).render('pages/error', {
      errorCode: status,
      errorTitle: status === 404 ? 'Character or template not found' : 'Character not saved',
      errorMessage: message,
      returnUrl
    });
  }

  async function renderTemplatePicker(req, res, next) {
    const list = listQuery(req.query, {
      name: 't.template_name',
      created: 't.created_at',
      id: 't.template_id'
    });
    try {
      const templates = await db.any(
        `SELECT t.template_id, t.template_name, t.template_desc,
                u.username AS creator_name, (t.user_id = $1) AS is_owner
         FROM templates t
         JOIN users u ON u.user_id = t.user_id
         WHERE (t.user_id = $1 OR EXISTS (
           SELECT 1 FROM player_library library
           WHERE library.template_id = t.template_id AND library.user_id = $1
         ))
           AND (t.template_name ILIKE $2 OR t.template_desc ILIKE $2 OR u.username ILIKE $2)
         ORDER BY ${list.orderBy}`,
        [req.session.user.id, list.pattern]
      );
      res.render('pages/character-builder', {
        title: 'Choose a character template',
        templates,
        list
      });
    } catch (err) {
      next(err);
    }
  }

  async function renderNewCharacter(req, res, next) {
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : '';
    if (!templateId) return renderTemplatePicker(req, res, next);

    try {
      const template = await findTemplate(templateId, req.session.user.id, true);
      if (!template) return renderError(res, 404, 'This template is not available.');
      return res.render('pages/character-builder', {
        title: 'Create a character',
        characterSheet: true,
        isNewCharacter: true,
        formAction: '/characters',
        template,
        initialTemplate: JSON.stringify(templateDocument(template)),
        playerState: JSON.stringify({}),
        characterName: ''
      });
    } catch (err) {
      next(err);
    }
  }

  router.get('/', (req, res, next) => {
    if (req.query.create !== '1' && typeof req.query.templateId !== 'string') return next();
    return renderNewCharacter(req, res, next);
  });
  router.get('/create', renderNewCharacter);
  router.get('/new', renderNewCharacter);

  router.post('/', async (req, res, next) => {
    const name = typeof req.body.character_name === 'string' ? req.body.character_name.trim() : '';
    const templateId = typeof req.body.template_id === 'string' ? req.body.template_id : '';
    const playerState = parsePlayerState(req.body.character_state);
    if (!name || name.length > 50) {
      return renderError(res, 400, 'Enter a character name of 1 to 50 characters.', `/characters/create?templateId=${encodeURIComponent(templateId)}`);
    }
    if (!playerState) {
      return renderError(res, 400, 'Character sheet values were invalid. Please try again.');
    }

    try {
      const template = await findTemplate(templateId, req.session.user.id, true);
      if (!template) return renderError(res, 404, 'This template is not available.');
      const characterData = { document: templateDocument(template), player: playerState };
      const character = await db.one(
        `INSERT INTO characters (character_name, user_id, template_id, character_data)
         VALUES ($1, $2, $3, $4:json)
         RETURNING character_id`,
        [name, req.session.user.id, template.template_id, characterData]
      );
      res.redirect(`/characters/${character.character_id}`);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return renderError(res, 404, 'This character does not exist.');
    try {
      const character = await db.oneOrNone(
        `SELECT c.character_id, c.character_name, c.template_id, c.character_data,
                t.template_name, t.template_desc, t.template_data, t.user_id AS template_owner_id
         FROM characters c
         LEFT JOIN templates t ON t.template_id = c.template_id
         WHERE c.character_id = $1 AND c.user_id = $2`,
        [req.params.id, req.session.user.id]
      );
      if (!character) return renderError(res, 404, 'This character does not exist.');

      const savedData = character.character_data || {};
      const sourceData = character.template_data || {};
      const document = savedData.document || (character.template_id
        ? Array.isArray(sourceData.modules) || isRecord(sourceData.stats)
          ? templateDocument({
          template_id: character.template_id,
          template_name: character.template_name || 'Character sheet',
          template_desc: character.template_desc || '',
          template_data: sourceData
          })
          : { schemaVersion: 2, name: character.template_name || 'Character sheet',
            description: character.template_desc || '', modules: [] }
        : { schemaVersion: 2, name: 'Character sheet', description: '', modules: [] });
      const template = {
        template_id: character.template_id,
        template_name: character.template_name || document.name,
        template_desc: character.template_desc || document.description,
        is_owner: Number(character.template_owner_id) === Number(req.session.user.id)
      };
      return res.render('pages/character-builder', {
        title: character.character_name,
        characterSheet: true,
        isNewCharacter: false,
        formAction: `/characters/${character.character_id}`,
        characterId: character.character_id,
        characterName: character.character_name,
        template,
        initialTemplate: JSON.stringify(document),
        playerState: JSON.stringify(savedData.player || {})
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id', async (req, res, next) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return renderError(res, 404, 'This character does not exist.');
    const name = typeof req.body.character_name === 'string' ? req.body.character_name.trim() : '';
    const playerState = parsePlayerState(req.body.character_state);
    if (!name || name.length > 50) {
      return renderError(res, 400, 'Enter a character name of 1 to 50 characters.');
    }
    if (!playerState) return renderError(res, 400, 'Character sheet values were invalid. Please try again.');

    try {
      const character = await db.oneOrNone(
        `SELECT c.character_data, c.template_id, t.template_name, t.template_desc, t.template_data
         FROM characters c
         LEFT JOIN templates t ON t.template_id = c.template_id
         WHERE c.character_id = $1 AND c.user_id = $2`,
        [req.params.id, req.session.user.id]
      );
      if (!character) return renderError(res, 404, 'This character does not exist.');
      const characterData = character.character_data || {};
      if (!characterData.document && character.template_id) {
        const sourceData = character.template_data || {};
        characterData.document = Array.isArray(sourceData.modules) || isRecord(sourceData.stats)
          ? templateDocument({
            template_id: character.template_id,
            template_name: character.template_name || 'Character sheet',
            template_desc: character.template_desc || '',
            template_data: sourceData
          })
          : { schemaVersion: 2, name: character.template_name || 'Character sheet',
            description: character.template_desc || '', modules: [] };
      }
      characterData.player = playerState;
      await db.none(
        `UPDATE characters
         SET character_name = $1, character_data = $2:json
         WHERE character_id = $3 AND user_id = $4`,
        [name, characterData, req.params.id, req.session.user.id]
      );
      res.redirect(`/characters/${req.params.id}`);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
