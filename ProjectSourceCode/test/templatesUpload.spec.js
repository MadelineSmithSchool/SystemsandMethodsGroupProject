const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('POST /templates/upload', () => {
  const testUser = {
    username: `template_upload_${randomUUID()}`,
    email: `${randomUUID()}@example.com`,
    password: 'TestPassword123!',
  };

  async function removeTestData() {
    await db.none(
      'DELETE FROM templates WHERE user_id IN (SELECT user_id FROM users WHERE username = $1)',
      [testUser.username]
    );
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  before(async () => {
    await removeTestData();
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    await db.none(
      'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4)',
      [testUser.username, testUser.email, passwordHash, randomUUID().replace(/-/g, '')]
    );
  });
  after(removeTestData);

  it('uses the uploaded filename when the JSON template has no name', async () => {
    const agent = chai.request.agent(app);
    try {
      await agent.post('/login').type('form').send(testUser).redirects(0);

      const template = {
        schemaVersion: 2,
        modules: [{
          id: '1',
          type: 'number',
          name: 'Strength',
          col: 1,
          row: 1,
          colSpan: 4,
          rowSpan: 3,
        }],
      };
      const response = await agent
        .post('/templates/upload')
        .attach('template', Buffer.from(JSON.stringify(template)), 'template.json')
        .redirects(0);

      expect(response).to.have.status(302);
      expect(response).to.have.header('location', '/templates/new');

      const saved = await db.one(
        `SELECT t.template_name, t.template_data
         FROM templates t
         JOIN users u ON u.user_id = t.user_id
         WHERE u.username = $1`,
        [testUser.username]
      );
      expect(saved.template_name).to.equal('template');
      expect(saved.template_data.name).to.equal('template');
    } finally {
      agent.close();
    }
  });
});
