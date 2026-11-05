// POST /login tests (extra credit, feature other than register)
// uses an agent so the login cookie carries over to the next request
// pgp.end() is in server.spec.js so dont add it here
const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID, randomBytes} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('POST /login', () => {
  const testUser = {
    username: `lab10_login_${randomUUID()}`,
    password: 'TestPassword123!',
  };
  let agent;

  // put the user straight in the db so these dont depend on /register
  before(async () => {
    const hash = await bcrypt.hash(testUser.password, 10);
    await db.none(
      'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4)',
      [testUser.username, 'lab10_login@example.com', hash, randomBytes(16).toString('hex')]
    );
  });

  after(async () => {
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  });

  // fresh agent each test so one test cant use another tests login
  beforeEach(() => {
    agent = chai.request.agent(app);
  });

  afterEach(async () => {
    if (agent) await agent.close();
  });

  it('logs in with the right password and can open the page it redirects to', async () => {
    const login = await agent.post('/login').type('form').send(testUser).redirects(0);
    expect(login).to.have.status(302);
    expect(login).to.have.header('set-cookie');

    // follow the redirect with the same agent, should load since we're logged in
    const page = await agent.get(login.headers.location).redirects(0);
    expect(page).to.have.status(200);
    expect(page).to.be.html;
  });

  it('rejects a wrong password and stays logged out', async () => {
    const login = await agent
      .post('/login')
      .type('form')
      .send({username: testUser.username, password: 'WrongPassword123!'})
      .redirects(0);
    expect(login).to.have.status(401);
    expect(login).to.be.html;
    expect(login.text).to.include('The username or password is incorrect.');

    // still logged out so a protected page sends us to /login
    const templates = await agent.get('/templates').redirects(0);
    expect(templates).to.have.status(302);
    expect(templates).to.have.header('location', '/login');
  });
});
