// mocha loads this before any test file (see the test script in package.json)
// always test mode, so src/db.js refuses to run on a db that doesnt end in _test
process.env.NODE_ENV = 'test';
