// POST /login tests (Lab 10 extra credit), hits the real route + test db
// pgp.end() is in server.spec.js so dont add it here
const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('POST /login', () => {
  // random username so it never clashes with a real user
  const testUser = {
    username: `lab10_${randomUUID()}`,
    password: 'TestPassword123!',
  };

  async function removeTestUser() {
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  // make a user to log in as
  beforeEach(async () => {
    await removeTestUser();
    const hash = await bcrypt.hash(testUser.password, 10);
    await db.none(
      'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4)',
      [testUser.username, 'lab10@example.com', hash, randomUUID().replace(/-/g, '')]
    );
  });
  afterEach(removeTestUser);

  // positive + redirect test
  it('redirects to /dashboard for the right password', async () => {
    const res = await chai.request(app).post('/login').type('form').send(testUser).redirects(0);

    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/dashboard');
  });

  // negative + render test
  it('renders the login page with an error for the wrong password', async () => {
    const res = await chai.request(app).post('/login').type('form')
      .send({username: testUser.username, password: 'WrongPassword123!'}).redirects(0);

    expect(res).to.have.status(401);
    expect(res).to.be.html;
    expect(res.text).to.include('The username or password is incorrect.');
  });
});
