const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('POST /templates/:id/delete', () => {
  const suffix = randomUUID();
  const owner = {
    username: `td_owner_${suffix.replace(/-/g, '')}`,
    email: `${suffix}_owner@example.com`,
    password: 'TestPassword123!',
  };
  const otherUser = {
    username: `td_other_${suffix.replace(/-/g, '')}`,
    email: `${suffix}_other@example.com`,
    password: 'TestPassword123!',
  };
  let templateId;

  async function removeTestData() {
    await db.none(
      `DELETE FROM player_library
       WHERE user_id IN (SELECT user_id FROM users WHERE username IN ($1, $2))
          OR template_id = $3`,
      [owner.username, otherUser.username, templateId || -1]
    );
    await db.none(
      `DELETE FROM characters
       WHERE user_id IN (SELECT user_id FROM users WHERE username IN ($1, $2))
          OR template_id = $3`,
      [owner.username, otherUser.username, templateId || -1]
    );
    await db.none('DELETE FROM templates WHERE template_id = $1', [templateId || -1]);
    await db.none('DELETE FROM users WHERE username IN ($1, $2)', [owner.username, otherUser.username]);
  }

  before(async () => {
    await removeTestData();
    const passwordHash = await bcrypt.hash(owner.password, 10);
    const otherPasswordHash = await bcrypt.hash(otherUser.password, 10);
    const users = await db.tx(async (transaction) => {
      const ownerRow = await transaction.one(
        'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4) RETURNING user_id',
        [owner.username, owner.email, passwordHash, randomUUID().replace(/-/g, '')]
      );
      const otherRow = await transaction.one(
        'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4) RETURNING user_id',
        [otherUser.username, otherUser.email, otherPasswordHash, randomUUID().replace(/-/g, '')]
      );
      const template = await transaction.one(
        `INSERT INTO templates (template_name, template_desc, template_data, user_id)
         VALUES ('Delete test template', '', $1:json, $2) RETURNING template_id`,
        [{
          schemaVersion: 2,
          modules: [{ id: '1', type: 'number', name: 'Strength', col: 1, row: 1, colSpan: 4, rowSpan: 3 }],
        }, ownerRow.user_id]
      );
      await transaction.none(
        'INSERT INTO player_library (user_id, template_id) VALUES ($1, $2), ($3, $2)',
        [ownerRow.user_id, template.template_id, otherRow.user_id]
      );
      await transaction.none(
        'INSERT INTO characters (character_name, user_id, template_id) VALUES ($1, $2, $3)',
        ['Delete test character', ownerRow.user_id, template.template_id]
      );
      return { templateId: template.template_id };
    });
    templateId = users.templateId;
  });

  after(removeTestData);

  it('only renders the delete control for the owner and removes owned templates', async () => {
    const ownerAgent = chai.request.agent(app);
    const otherAgent = chai.request.agent(app);
    try {
      await ownerAgent.post('/login').type('form').send(owner).redirects(0);
      await otherAgent.post('/login').type('form').send(otherUser).redirects(0);

      const ownerPage = await ownerAgent.get(`/templates/${templateId}`);
      expect(ownerPage).to.have.status(200);
      expect(ownerPage.text).to.include('data-open-template-delete');
      expect(ownerPage.text).to.include('data-template-delete-dialog');

      const otherPage = await otherAgent.get(`/templates/${templateId}`);
      expect(otherPage).to.have.status(200);
      expect(otherPage.text).not.to.include('data-open-template-delete');
      expect(otherPage.text).not.to.include('data-template-delete-dialog');

      const denied = await otherAgent.post(`/templates/${templateId}/delete`).redirects(0);
      expect(denied).to.have.status(404);
      expect(await db.oneOrNone('SELECT template_id FROM templates WHERE template_id = $1', [templateId])).not.to.equal(null);

      const response = await ownerAgent.post(`/templates/${templateId}/delete`).redirects(0);
      expect(response).to.have.status(302);
      expect(response).to.have.header('location', '/templates');
      expect(await db.oneOrNone('SELECT template_id FROM templates WHERE template_id = $1', [templateId])).to.equal(null);
      expect(await db.oneOrNone('SELECT library_id FROM player_library WHERE template_id = $1', [templateId])).to.equal(null);
      const character = await db.one('SELECT template_id FROM characters WHERE character_name = $1', ['Delete test character']);
      expect(character.template_id).to.equal(null);
    } finally {
      ownerAgent.close();
      otherAgent.close();
    }
  });
});
