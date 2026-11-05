// starts the server (npm start). app.js just builds the app so the tests can import it
const fs = require('fs');
const path = require('path');
const app = require('./app');
const { db } = require('./src/db');

const port = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await db.none(fs.readFileSync(path.join(__dirname, 'create.sql'), 'utf8'));
    await db.none(fs.readFileSync(path.join(__dirname, 'migrations', '002_admin.sql'), 'utf8'));
    console.log('Database connection successful');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
    return;
  }

  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
};

startServer();
