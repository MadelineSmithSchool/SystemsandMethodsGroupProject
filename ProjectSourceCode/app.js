//dependencies
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
const login = false;

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

app.use(session(
  {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

//css
app.use('/css', express.static(path.join(__dirname, 'pages', 'css')));

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
//ROUTES//

//TODO:
//add auth param to anything that needs auth to use (like app.get('/tutorial', auth, ...))

app.get('/', (req, res) => res.render('pages/index'));
app.get('/login', (req, res) => res.render('pages/login'));
app.get('/register', (req, res) => res.render('pages/register'));

app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.render('pages/register', { error: 'Username, email, and password are required' });
    }
    const hash = await bcrypt.hash(req.body.password, 10);
    const authToken = crypto.randomBytes(16).toString('hex');
    await db.none(
      'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4)',
      [username, email, hash, authToken]
    );
    res.redirect('/login');
  } catch (err) {
    // 23505 = unique violation (username taken)
    const error = err.code === '23505' ? 'Username already taken' : 'Registration failed';
    console.error('Registration failed:', err);
    res.render('pages/register', { error });
  }
});

app.post('/login', async (req, res) => {
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1',
      [req.body.username]);
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.render('pages/login', { error: 'Invalid username or password' });
    }
    req.session.user = { id: user.user_id, username: user.username };
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

const auth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

app.get('/tutorial', auth, (req, res) => {
  res.render('pages/tutorial', { title: 'Dashboard tutorial' , login: true});
});

// upload / send templates (routes/templates.js)
app.use('/templates', require('./routes/templates')(db, auth));