// Upload and send character templates. Mounted at /templates in index.js.
const express = require('express');
const multer = require('multer');
const templates = require('../models/templates');

const router = express.Router();

// Uploads stay in memory: we only need the file's JSON text, not a copy on disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
}).single('template');

// Login isn't wired up yet, so templates are ownerless until req.session.user exists.
function currentUserId(req) {
  return req.session && req.session.user ? req.session.user.id : null;
}

// Loads the template in the URL into req.template, if this user is allowed to see it.
// Ownerless templates (uploaded before login existed) are open to everyone.
async function loadOwnTemplate(req, res, next) {
  try {
    const template = await templates.findById(Number(req.params.id));
    if (!template || (template.owner_id !== null && template.owner_id !== currentUserId(req))) {
      return res.status(404).send('Template not found.');
    }
    req.template = template;
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/upload', (req, res) => {
  res.render('pages/upload', { title: 'Upload a template' });
});

router.post('/upload', (req, res, next) => {
  const fail = (error) => res.status(400).render('pages/upload', { title: 'Upload a template', error });

  upload(req, res, async (uploadErr) => {
    if (uploadErr instanceof multer.MulterError) {
      return fail(
        uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'That file is too big (1 MB max).'
          : 'Upload failed. Pick a single template file and try again.'
      );
    }
    if (uploadErr) return next(uploadErr);
    if (!req.file) return fail('Pick a template file to upload.');

    try {
      const data = templates.parseTemplate(req.file.buffer.toString('utf8'));
      const template = await templates.create(currentUserId(req), data);
      res.redirect(`/templates/${template.id}`);
    } catch (err) {
      if (err instanceof templates.TemplateFormatError) return fail(err.message);
      next(err);
    }
  });
});

router.get('/:id', loadOwnTemplate, (req, res) => {
  res.render('pages/template', { title: req.template.name, template: req.template });
});

module.exports = router;
