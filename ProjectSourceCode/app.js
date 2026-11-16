const express = require('express');
const session = require('express-session');
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios');
const validateRegistration = require('./src/validateRegistration');
const { sendResetEmail } = require('./src/mailer');
const { listQuery, MOST_SAVED } = require('./src/listQuery');

//For handlebars
const hbs = handlebars.create({
  extname: '.hbs',
  layoutsDir: path.join(__dirname, 'layouts'),
  defaultLayout: 'main',
  partialsDir: path.join(__dirname, 'partials'),
});

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', __dirname);
app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.login = Boolean(req.session.user);
  next();
});

const auth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

// Serve the stylesheet at /css/styles.css no matter what the folder is called
// (CSS, css, ...) or how deep it sits inside ProjectSourceCode.
app.use('/css', express.static(path.join(__dirname, 'pages', 'css')));
app.use('/images', express.static(path.join(__dirname, 'pages', 'images')));
[
  'modules-main.js',
  'modules-render.js',
  'modules-database.js',
  'modules-helper.js',
  'modules-config.js',
].forEach((file) => {
  app.get('/js/' + file, (req, res) => {
    res.sendFile(path.join(__dirname, 'routes', file));
  });
});

// db connection lives in src/db.js so the tests use the same one
const { db } = require('./src/db');

// alert bar from the admin page, shows at the top of every page
app.use(async (req, res, next) => {
  try {
    const alert = await db.oneOrNone('SELECT message FROM site_alerts ORDER BY created_at DESC LIMIT 1');
    res.locals.siteAlert = alert && alert.message;
  } catch (err) {
    console.error('Could not load the site alert:', err);
  }
  next();
});

//ROUTES//

//TODO:
//add auth param to anything that needs auth to use (like app.get('/tutorial', auth, ...))

app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.render('pages/index');
  }
  res.redirect('/dashboard');
});
app.get('/login', (req, res) => res.render('pages/login'));
app.get('/register', (req, res) => res.render('pages/register'));
app.get('/dashboard', auth, (req, res) => {
  res.render('pages/dashboard', { title: 'Dashboard' , login: true });
});
app.get('/tutorial', auth, (req, res) => {
  res.render('pages/tutorial', { title: 'Dashboard Tutorial' , login: true});
});
// search by name, description or creator, sort with ?sort= (see src/listQuery.js)
// times_saved = how many other people saved it to their templates (same count as the template page)
app.get('/library', auth, async (req, res) => {
  const list = listQuery(
    req.query,
    { name: 't.template_name', created: 't.created_at', id: 't.template_id', saves: 'times_saved' },
    { sorts: [MOST_SAVED] }
  );
  try {
    const templates = await db.any(
      `SELECT t.template_id, t.template_name, t.template_desc, to_char(t.created_at, 'Mon FMDD, YYYY') AS created_date,
              u.username AS creator_name,
              (SELECT COUNT(DISTINCT library.user_id)::int FROM player_library library
               WHERE library.template_id = t.template_id AND library.user_id <> t.user_id) AS times_saved
       FROM templates t
       LEFT JOIN users u ON u.user_id = t.user_id
       WHERE t.privacy_level = 1
         AND (t.template_name ILIKE $1 OR t.template_desc ILIKE $1 OR u.username ILIKE $1)
       ORDER BY ${list.orderBy}`,
      [list.pattern]
    );
    res.render('pages/library', { title: 'Template', login: true, templates, list });
  } catch (err) {
    console.error('Library query failed:', err);
    res.status(500).render('pages/library', {
      title: 'Template', login: true, templates: [], list, error: 'Could not load the library.'
    });
  }
});
// search by character name or template name
app.get('/characters', auth, async (req, res) => {
  const list = listQuery(req.query, { name: 'c.character_name', created: 'c.created_at', id: 'c.character_id' });
  try {
    const characters = await db.any(
      `SELECT c.character_id, c.character_name, c.privacy_level, c.created_at,
              t.template_name
       FROM characters c
       LEFT JOIN templates t ON t.template_id = c.template_id
       WHERE c.user_id = $1
         AND (c.character_name ILIKE $2 OR t.template_name ILIKE $2)
       ORDER BY ${list.orderBy}`,
      [req.session.user.id, list.pattern]
    );
    res.render('pages/characters', { title: 'My Characters', login: true, characters, list });
  } catch (err) {
    console.error('Characters query failed:', err);
    res.status(500).render('pages/characters', {
      title: 'My Characters', login: true, characters: [], list, error: 'Could not load your characters.'
    });
  }
});
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

const renderSettings = async (req, res, extra = {}, status = 200) => {
  try {
    const account = await db.one(
      'SELECT username, email FROM users WHERE user_id = $1',
      [req.session.user.id]
    );
    const flash = req.session.flash || {};
    delete req.session.flash;
    res.status(status).render('pages/settings', {
      title: 'Settings',
      login: true,
      account,
      ...flash,
      ...extra,
    });
  } catch (err) {
    console.error('Settings load failed:', err);
    res.redirect('/logout');
  }
};

app.get('/settings', auth, (req, res) => renderSettings(req, res));

app.post('/settings/profile', auth, async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const errors = [];

  if (!username) errors.push('Enter a username.');
  else if (username.length > 50) errors.push('Your username must be 50 characters or fewer.');

  if (!email) errors.push('Enter an email.');
  else if (email.length > 255 || !/^\S+@\S+\.\S+$/.test(email)) errors.push('Enter a valid email address.');

  if (errors.length > 0) {
    return renderSettings(req, res, { errors, account: { username, email } }, 400);
  }

  try {
    await db.none(
      'UPDATE users SET username = $1, email = $2 WHERE user_id = $3',
      [username, email, req.session.user.id]
    );
    req.session.user.username = username;
    req.session.flash = { success: 'Profile updated.' };
    req.session.save(() => res.redirect('/settings'));
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_username_key') {
      return renderSettings(req, res, {
        errors: ['That username is already taken.'],
        account: { username, email },
      }, 409);
    }
    console.error('Profile update failed:', err);
    renderSettings(req, res, { errors: ['We could not update your profile right now.'] }, 500);
  }
});

app.post('/settings/password', auth, async (req, res) => {
  const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
  const newPassword = typeof req.body.new_password === 'string' ? req.body.new_password : '';
  const confirm = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';

  try {
    const user = await db.one(
      'SELECT username, email, password_hash FROM users WHERE user_id = $1',
      [req.session.user.id]
    );

    if (!(await bcrypt.compare(current, user.password_hash))) {
      return renderSettings(req, res, { errors: ['Your current password is incorrect.'] }, 401);
    }
    if (newPassword !== confirm) {
      return renderSettings(req, res, { errors: ['The new passwords do not match.'] }, 400);
    }

    const errors = validateRegistration({
      username: user.username,
      email: user.email,
      password: newPassword,
    });
    if (errors.length > 0) {
      return renderSettings(req, res, { errors }, 400);
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.none('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, req.session.user.id]);
    req.session.flash = { success: 'Password updated.' };
    req.session.save(() => res.redirect('/settings'));
  } catch (err) {
    console.error('Password change failed:', err);
    renderSettings(req, res, { errors: ['We could not change your password right now.'] }, 500);
  }
});

app.post('/settings/delete', auth, async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  try {
    const user = await db.one('SELECT password_hash FROM users WHERE user_id = $1', [req.session.user.id]);
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return renderSettings(req, res, { errors: ['Wrong password. Your account was not deleted.'] }, 401);
    }
    await db.none('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.session.user.id]);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/login');
    });
  } catch (err) {
    console.error('Account delete failed:', err);
    renderSettings(req, res, { errors: ['We could not delete your account right now.'] }, 500);
  }
});

// This admin route is called /manage to make it marginally harder for bots to find.
// make someone an admin with: UPDATE users SET is_admin = TRUE WHERE username = '...';
app.use('/manage', require('./routes/admin')(db));

app.post('/register', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const errors = validateRegistration({ username, email, password });

  if (errors.length > 0) {
    return res.status(400).render('pages/register', { errors, username, email });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const authToken = crypto.randomBytes(16).toString('hex');
    await db.none(
      'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4)',
      [username, email, hash, authToken]
    );
    res.redirect('/login');
  } catch (err) {
    console.error('Registration failed:', err);
    if (err.code === '23505' && err.constraint === 'users_username_key') {
      return res.status(409).render('pages/register', {
        errors: ['That username is already taken. Choose another username or log in.'],
        username,
        email,
      });
    }
    res.status(500).render('pages/register', {
      errors: ['We could not create your account right now. Please try again later.'],
      username,
      email,
    });
  }
});

app.post('/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const errors = [];

  if (!username) {
    errors.push('Enter your username.');
  } else if (username.length > 50) {
    errors.push('Your username must be 50 characters or fewer.');
  }

  if (!password) {
    errors.push('Enter your password.');
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Your password must be no more than 72 bytes long.');
  }

  if (errors.length > 0) {
    return res.status(400).render('pages/login', { errors, username });
  }

  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1',
      [username]);
    if (
      !user ||
      !user.password_hash ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).render('pages/login', {
        errors: ['The username or password is incorrect. Check your details and try again.'],
        username,
      });
    }
    if (user.deleted_at) {
      return res.status(403).render('pages/login', {
        errors: ['This account has been deleted. Ask an admin if you want it back.'],
        username,
      });
    }
    req.session.user = { id: user.user_id, username: user.username, admin: user.is_admin };
    req.session.save(error => {
      if (error) {
        console.error('Login session could not be saved:', error);
        req.session.user = null;
        return res.status(500).render('pages/login', {
          errors: ['We could not complete your login right now. Please try again.'],
          username,
        });
      }
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).render('pages/login', {
      errors: ['We could not log you in right now. Please try again later.'],
      username,
    });
  }
});

// ---------- FORGOT / RESET PASSWORD ----------
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

app.get('/forgot-password', (req, res) => res.render('pages/forgot-password'));

app.post('/forgot-password', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const done = () => res.render('pages/forgot-password', {
    success: 'If an account uses that email, a reset link is on its way.',
  });

  if (!email || email.length > 255) return done();

  try {
    const users = await db.any(
      'SELECT user_id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
      [email]
    );
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    for (const u of users) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.none(
        `UPDATE users SET reset_token_hash = $1, reset_expires_at = NOW() + INTERVAL '1 hour'
         WHERE user_id = $2`,
        [hashToken(token), u.user_id]
      );
      await sendResetEmail(email, `${baseUrl}/reset-password/${token}`);
    }
  } catch (err) {
    console.error('Forgot password failed:', err);
  }
  done();
});

const findResetUser = (token) => db.oneOrNone(
  `SELECT user_id, username, email FROM users
   WHERE reset_token_hash = $1 AND reset_expires_at > NOW() AND deleted_at IS NULL`,
  [hashToken(token)]
);

app.get('/reset-password/:token', async (req, res) => {
  try {
    if (!(await findResetUser(req.params.token))) {
      return res.status(400).render('pages/forgot-password', {
        errors: ['That reset link is invalid or has expired. Request a new one.'],
      });
    }
    res.render('pages/reset-password', { token: req.params.token });
  } catch (err) {
    console.error('Reset page failed:', err);
    res.redirect('/forgot-password');
  }
});

app.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirm = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';

  try {
    const user = await findResetUser(token);
    if (!user) {
      return res.status(400).render('pages/forgot-password', {
        errors: ['That reset link is invalid or has expired. Request a new one.'],
      });
    }
    if (password !== confirm) {
      return res.status(400).render('pages/reset-password', { token, errors: ['The passwords do not match.'] });
    }
    const errors = validateRegistration({ username: user.username, email: user.email, password });
    if (errors.length > 0) {
      return res.status(400).render('pages/reset-password', { token, errors });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.none(
      `UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_expires_at = NULL
       WHERE user_id = $2`,
      [hash, user.user_id]
    );
    res.render('pages/login', { success: 'Password updated. Log in with your new password.' });
  } catch (err) {
    console.error('Password reset failed:', err);
    res.status(500).render('pages/reset-password', {
      token,
      errors: ['Cannnot reset password right now. Please try again.'],
    });
  }
});

// upload / send / edit templates templates (routes/templates.js)
const templateRoutes = require('./routes/templates')(db, auth);
app.use('/templates', auth, templateRoutes);
app.use('/edit', templateRoutes.edit);

// testing
app.get('/welcome', (req, res) => {
  res.json({status: 'success', message: 'Welcome!'});
});

const startServer = async () => {
  try {
    const migration = fs.readFileSync(
      path.join(__dirname, 'create.sql'),
      'utf8'
    ); 
    await db.none(migration);
    await db.none(fs.readFileSync(path.join(__dirname, 'migrations', '002_admin.sql'), 'utf8'));
    await db.none(fs.readFileSync(path.join(__dirname, 'migrations', '003_password_reset.sql'), 'utf8'));
    console.log('Database connection successful');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
    return;
  }

  app.listen(3000, () => {
    console.log('Server is listening on port 3000');
  });
};

// only start the server when you run app.js (npm start / nodemon app.js)
// the tests require app.js, this way they get the app without it starting a server
if (require.main === module) {
  startServer();
}

module.exports = app;
