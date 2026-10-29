const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');
const fs = require('fs');

const app = express();

app.engine(
  'hbs',
  exphbs.engine({
    extname: '.hbs',
    layoutsDir: path.join(__dirname, 'ProjectSourceCode', 'layouts'),
    defaultLayout: 'main',
    partialsDir: path.join(
      __dirname,
      'ProjectSourceCode',
      'partials'
    )
  })
);

app.set('view engine', 'hbs');   // <-- Missing
app.set('views', path.join(__dirname, 'ProjectSourceCode', 'pages'));

app.use(express.static(path.join(__dirname, 'ProjectSourceCode')));

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

app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// The layout (layouts/main.hbs) adds the head and the nav bar, so pages hold content only.
// Views folder is ProjectSourceCode/pages, so this renders pages/tutorial.hbs.
app.get('/tutorial', (req, res) => {
  res.render('tutorial', { title: 'Dashboard tutorial' });
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});