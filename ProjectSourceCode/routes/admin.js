// admin page (/manage)
const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // only admins get in, everyone else just sees a 404
  router.use((req, res, next) => {
    if (!req.session.user || !req.session.user.admin) return res.status(404).send('Not found.');
    res.locals.admin = true; // for the nav
    next();
  });

  // search users and templates (?users=... and ?templates=... from the nav search boxes)
  router.get('/', async (req, res, next) => {
    const userSearch = typeof req.query.users === 'string' ? req.query.users.trim() : '';
    const templateSearch = typeof req.query.templates === 'string' ? req.query.templates.trim() : '';

    try {
      const users = await db.any(
        `SELECT u.user_id, u.username, u.email, u.is_admin, to_char(u.created_at, 'YYYY-MM-DD') AS joined,
           to_char(u.deleted_at, 'YYYY-MM-DD') AS deleted,
           COUNT(t.template_id) AS template_count
         FROM users u LEFT JOIN templates t ON t.user_id = u.user_id
         WHERE u.username ILIKE $1 OR u.email ILIKE $1
         GROUP BY u.user_id ORDER BY u.username LIMIT 50`,
        ['%' + userSearch + '%']
      );
      const templates = await db.any(
        `SELECT t.template_id, t.template_name, t.share_id, u.username, to_char(t.created_at, 'YYYY-MM-DD') AS created
         FROM templates t LEFT JOIN users u ON u.user_id = t.user_id
         WHERE t.template_name ILIKE $1 OR t.template_desc ILIKE $1 OR u.username ILIKE $1
         ORDER BY t.created_at DESC LIMIT 50`,
        ['%' + templateSearch + '%']
      );
      const counts = await db.one(
        `SELECT (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL) AS deleted,
           (SELECT COUNT(*) FROM templates) AS templates,
           (SELECT COUNT(*) FROM templates WHERE share_id IS NOT NULL) AS shared`
      );
      res.render('pages/admin', { title: 'Admin', users, templates, counts, userSearch, templateSearch });
    } catch (err) {
      next(err);
    }
  });

  // delete just marks the account, so it can be recovered later
  router.post('/users/:id/delete', async (req, res, next) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return res.status(404).send('User not found.');
    if (Number(req.params.id) === req.session.user.id) return res.status(400).send('You can not delete your own account.');
    try {
      await db.none('UPDATE users SET deleted_at = NOW() WHERE user_id = $1', [req.params.id]);
      res.redirect('/manage');
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/recover', async (req, res, next) => {
    if (!/^\d{1,9}$/.test(req.params.id)) return res.status(404).send('User not found.');
    try {
      await db.none('UPDATE users SET deleted_at = NULL WHERE user_id = $1', [req.params.id]);
      res.redirect('/manage');
    } catch (err) {
      next(err);
    }
  });

  return router;
};
