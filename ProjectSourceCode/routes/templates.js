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

// Loads a template by its share link into req.template. Anyone with the link can see it.
async function loadSharedTemplate(req, res, next) {
  try {
    const template = await templates.findByShareId(req.params.shareId);
    if (!template) {
      return res.status(404).send('This share link is invalid or was removed.');
    }
    req.template = template;
    next();
  } catch (err) {
    next(err);
  }
}

// Sends a template back as a downloadable .json file in the same format as uploads.
function sendTemplateFile(res, template) {
  const fileName =
    template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
  res.attachment(`${fileName}.json`);
  res.send(JSON.stringify(template.data, null, 2));
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

// ---------- Send (share links) ----------
// Sending is a copy-link: the link works for anyone, logged in or not.

router.get('/shared/:shareId', loadSharedTemplate, (req, res) => {
  res.render('pages/shared', { title: req.template.name, template: req.template });
});

router.get('/shared/:shareId/download', loadSharedTemplate, (req, res) => {
  sendTemplateFile(res, req.template);
});

// ---------- Your own templates ----------

router.get('/:id', loadOwnTemplate, (req, res) => {
  res.render('pages/template', { title: req.template.name, template: req.template });
});

router.get('/:id/share', loadOwnTemplate, async (req, res, next) => {
  try {
    const template = await templates.ensureShareId(req.template.id);
    const shareUrl = `${req.protocol}://${req.get('host')}/templates/shared/${template.share_id}`;
    res.render('pages/share', { title: `Send ${template.name}`, template, shareUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
