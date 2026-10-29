//quite literally just copied and pasted from lab 7.
const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const fs = require('fs');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios');

//For handlebars
const hbs = handlebars.create({
  extname: '.hbs',
  layoutsDir: path.join(__dirname, 'ProjectSourceCode', 'layouts'),
  defaultLayout: 'main',
  partialsDir: path.join(__dirname, 'ProjectSourceCode', 'partials'),
});

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'ProjectSourceCode', 'pages'));
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
function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}
const stylesPath = findFile(path.join(__dirname, 'ProjectSourceCode'), 'styles.css');
console.log('Serving /css/styles.css from:', stylesPath || 'NOT FOUND - check your CSS folder');
app.get('/css/styles.css', (req, res) => {
  if (!stylesPath) return res.status(404).send('styles.css not found');
  res.sendFile(stylesPath);
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

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });
//

app.listen(3000);
console.log('Server is listening on port 3000');

//Routes

//TODO:
//add auth param to anything that needs auth to use (like app.get('/tutorial', auth, ...))

app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('pages/login'));
app.get('/register', (req, res) => res.render('pages/register'));

app.post('/register', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await db.none('INSERT INTO users (username, password) VALUES ($1, $2)',
      [req.body.username, hash]);
    res.redirect('/login');
  } catch (err) {
    // 23505 = unique violation (username taken)
    const error = err.code === '23505' ? 'Username already taken' : 'Registration failed';
    res.render('pages/register', { error });
  }
});

app.post('/login', async (req, res) => {
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1',
      [req.body.username]);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.render('pages/login', { error: 'Invalid username or password' });
    }
    req.session.user = { id: user.id, username: user.username };
    req.session.save(() => res.redirect('/tutorial')); // TODO: change to real landing page
  } catch (err) {
    console.log(err);
    res.render('pages/login', { error: 'Something went wrong' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

app.get('/tutorial', auth, (req, res) => {
  res.render('pages/tutorial', { title: 'Dashboard tutorial' });
});