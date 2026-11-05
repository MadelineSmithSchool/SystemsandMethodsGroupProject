const express = require('express');
const session = require('express-session');
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios');

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
  next();
});

const auth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

// Serve the stylesheet at /css/styles.css no matter what the folder is called
// (CSS, css, ...) or how deep it sits inside ProjectSourceCode.
app.use('/css', express.static(path.join(__dirname, 'pages', 'css')));
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

// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

//ROUTES//

//TODO:
//add auth param to anything that needs auth to use (like app.get('/tutorial', auth, ...))

app.get('/', (req, res) => res.render('pages/index'));
app.get('/login', (req, res) => res.render('pages/login'));
app.get('/register', (req, res) => res.render('pages/register'));
app.get('/dashboard', (req, res) => {
  if(!auth){res.redirect('/');}
  res.render('pages/dashboard', {login: true});
});

app.post('/register', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const errors = [];

  if (!username) {
    errors.push('Enter a username.');
  } else if (username.length > 50) {
    errors.push('Your username must be 50 characters or fewer.');
  }

  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Enter a valid email address (255 characters or fewer).');
  }

  if (password.length < 8) {
    errors.push('Your password must be at least 8 characters long.');
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Your password must be no more than 72 bytes long.');
  }

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
    req.session.user = { id: user.user_id, username: user.username };
    req.session.save(error => {
      if (error) {
        console.error('Login session could not be saved:', error);
        req.session.user = null;
        return res.status(500).render('pages/login', {
          errors: ['We could not complete your login right now. Please try again.'],
          username,
        });
      }
      res.redirect('/tutorial'); // TODO: change to real landing page
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).render('pages/login', {
      errors: ['We could not log you in right now. Please try again later.'],
      username,
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

app.get('/tutorial', auth, (req, res) => {
  res.render('pages/tutorial', { title: 'Dashboard tutorial' , login: true});
});

// This admin route is called /manage to make it marginally harder for bots to find.
app.get('/manage', (req, res) => {
  res.render('pages/admin', { title: 'Admin', admin: true });
});

// upload / send templates (routes/templates.js)
app.use('/templates', auth, require('./routes/templates')(db, auth));

const startServer = async () => {
  try {
    const migration = fs.readFileSync(
      path.join(__dirname, 'create.sql'),
      'utf8'
    ); 
    await db.none(migration);
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

startServer();
