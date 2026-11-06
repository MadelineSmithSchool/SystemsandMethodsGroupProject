// POST /register tests, hits the real route + test db
// pgp.end() is in server.spec.js so dont add it here
const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('POST /register', () => {
  // random username so it never clashes with a real user
  const testUser = {
    username: `lab10_${randomUUID()}`,
    email: 'lab10@example.com',
    password: 'TestPassword123!',
  };

  // only delete our test user, not the whole table
  async function removeTestUser() {
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  beforeEach(removeTestUser);
  afterEach(removeTestUser);

  it('creates exactly one user for valid input', async () => {
    const res = await chai.request(app).post('/register').type('form').send(testUser).redirects(0);

    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/login');

    const rows = await db.any(
      'SELECT username, email, password_hash, auth_token FROM users WHERE username = $1',
      [testUser.username]
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].username).to.equal(testUser.username);
    expect(rows[0].email).to.equal(testUser.email);
    expect(rows[0].auth_token).to.match(/^[0-9a-f]{32}$/);
    expect(rows[0].password_hash).not.to.equal(testUser.password);
    expect(await bcrypt.compare(testUser.password, rows[0].password_hash)).to.equal(true);
  });

  it('rejects a missing password and inserts no user', async () => {
    const {username, email} = testUser;
    const res = await chai.request(app).post('/register').type('form').send({username, email}).redirects(0);

    expect(res).to.have.status(400);
    expect(res).to.be.html;
    expect(res.text).to.include('Your password must be at least 8 characters long.');

    const rows = await db.any('SELECT 1 FROM users WHERE username = $1', [testUser.username]);
    expect(rows).to.have.lengthOf(0);
  });
});
