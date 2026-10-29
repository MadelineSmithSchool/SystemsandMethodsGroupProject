const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');

const app = express();

app.engine(
  'hbs',
  exphbs.engine({
    extname: '.hbs',
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

app.get('/', (req, res) => {
  res.render('index');
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});