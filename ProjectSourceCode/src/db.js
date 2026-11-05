// one db connection for the whole app, the tests import this too
const pgp = require('pg-promise')();

const database = process.env.POSTGRES_DB;

// dont let tests run against the real db
if (process.env.NODE_ENV === 'test' && (!database || !database.endsWith('_test'))) {
  throw new Error('Tests require a database name ending in _test');
}

const db = pgp({
  host: process.env.POSTGRES_HOST || 'db',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

module.exports = { db, pgp };
