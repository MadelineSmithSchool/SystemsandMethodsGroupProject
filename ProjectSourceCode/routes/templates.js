// upload + send templates
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const upload = multer({ limits: { fileSize: 1024 * 1024 } }); // 1 MB max, kept in memory

// returns an error message if the uploaded template is wrong, otherwise null
function checkTemplate(t) {
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

// sends a template back as a .json file (same format as uploads)
function download(res, template) {
  const fileName = template.template_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.attachment(fileName + '.json');
  res.send(JSON.stringify(template.template_data, null, 2));
}

module.exports = (db, auth) => {
  const router = express.Router();

  router.use((req, res, next) => {
    res.locals.login = !!req.session.user; // for the nav
    next();
  });

  // one of the logged in user's templates (null if it isn't theirs)
  const getMyTemplate = (req) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return null;
    return db.oneOrNone('SELECT * FROM templates WHERE template_id = $1 AND user_id = $2', [req.params.id, req.session.user.id]);
  };

  const getShared = (req) => db.oneOrNone('SELECT * FROM templates WHERE share_id = $1', [req.params.shareId]);

  // list of your templates (pick one to send)
  router.get('/', auth, async (req, res, next) => {
    try {
      const templates = await db.any('SELECT * FROM templates WHERE user_id = $1 ORDER BY created_at DESC', [req.session.user.id]);
      res.render('pages/templates', { templates });
    } catch (err) {
      next(err);
    }
  });

  router.get('/upload', auth, (req, res) => res.render('pages/upload'));

  router.post('/upload', auth, upload.single('template'), async (req, res, next) => {
    const fail = (error) => res.status(400).render('pages/upload', { error });
    if (!req.file) return fail('Pick a file to upload.');

    let t;
    try {
      t = JSON.parse(req.file.buffer.toString());
    } catch (err) {
      return fail('That file is not valid JSON.');
    }
    const error = checkTemplate(t);
    if (error) return fail(error);

    try {
      const data = { name: t.name.trim(), description: t.description || '', stats: t.stats, minorStats: t.minorStats || {} };
      const row = await db.one(
        'INSERT INTO templates (template_name, template_desc, template_data, user_id) VALUES ($1, $2, $3:json, $4) RETURNING template_id',
        [data.name, data.description, data, req.session.user.id]
      );
      res.redirect('/templates/' + row.template_id);
    } catch (err) {
      next(err);
    }
  });

  // ---- send (share links). anyone with the link can view it ----

  router.get('/shared/:shareId', async (req, res, next) => {
    try {
      const template = await getShared(req);
      if (!template) return res.status(404).send('This link is invalid.');
      res.render('pages/shared', { template });
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

  // save a copy of a sent template to your own templates
  router.post('/shared/:shareId/save', auth, async (req, res, next) => {
    try {
      const template = await getShared(req);
      if (!template) return res.status(404).send('This link is invalid.');
      const row = await db.one(
        'INSERT INTO templates (template_name, template_desc, template_data, user_id) VALUES ($1, $2, $3:json, $4) RETURNING template_id',
        [template.template_name, template.template_desc, template.template_data, req.session.user.id]
      );
      res.redirect('/templates/' + row.template_id);
    } catch (err) {
      next(err);
    }
  });

  // ---- your own templates ----

  router.get('/:id', auth, async (req, res, next) => {
    try {
      const template = await getMyTemplate(req);
      if (!template) return res.status(404).send('Template not found.');
      res.render('pages/template', { template });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/download', auth, async (req, res, next) => {
    try {
      const template = await getMyTemplate(req);
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
      // make the link the first time it's shared
      if (!template.share_id) {
        template = await db.one('UPDATE templates SET share_id = $1 WHERE template_id = $2 RETURNING *',
          [crypto.randomBytes(12).toString('hex'), template.template_id]);
      }
      const link = `${req.protocol}://${req.get('host')}/templates/shared/${template.share_id}`;
      res.render('pages/share', { template, link });
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
