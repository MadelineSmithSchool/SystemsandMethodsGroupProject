const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('POST /characters/:id/delete', () => {
  const suffix = randomUUID().replace(/-/g, '');
  const owner = {
    username: `cd_owner_${suffix}`,
    email: `${suffix}_owner@example.com`,
    password: 'TestPassword123!',
  };
  const otherUser = {
    username: `cd_other_${suffix}`,
    email: `${suffix}_other@example.com`,
    password: 'TestPassword123!',
  };
  let characterId;

  async function removeTestData() {
    await db.none(
      `DELETE FROM player_library
       WHERE user_id IN (SELECT user_id FROM users WHERE username IN ($1, $2))
          OR character_id = $3`,
      [owner.username, otherUser.username, characterId || -1]
    );
    await db.none(
      `DELETE FROM characters
       WHERE user_id IN (SELECT user_id FROM users WHERE username IN ($1, $2))
          OR character_id = $3`,
      [owner.username, otherUser.username, characterId || -1]
    );
    await db.none('DELETE FROM users WHERE username IN ($1, $2)', [owner.username, otherUser.username]);
  }

  before(async () => {
    await removeTestData();
    const ownerPasswordHash = await bcrypt.hash(owner.password, 10);
    const otherPasswordHash = await bcrypt.hash(otherUser.password, 10);
    const character = await db.tx(async (transaction) => {
      const ownerRow = await transaction.one(
        'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4) RETURNING user_id',
        [owner.username, owner.email, ownerPasswordHash, randomUUID().replace(/-/g, '')]
      );
      const otherRow = await transaction.one(
        'INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4) RETURNING user_id',
        [otherUser.username, otherUser.email, otherPasswordHash, randomUUID().replace(/-/g, '')]
      );
      const row = await transaction.one(
        'INSERT INTO characters (character_name, user_id) VALUES ($1, $2) RETURNING character_id',
        ['Delete test character', ownerRow.user_id]
      );
      await transaction.none(
        'INSERT INTO player_library (user_id, character_id) VALUES ($1, $2)',
        [otherRow.user_id, row.character_id]
      );
      return row;
    });
    characterId = character.character_id;
  });

  after(removeTestData);

  it('only lists a delete action for its owner and deletes the character', async () => {
    const ownerAgent = chai.request.agent(app);
    const otherAgent = chai.request.agent(app);
    try {
      await ownerAgent.post('/login').type('form').send(owner).redirects(0);
      await otherAgent.post('/login').type('form').send(otherUser).redirects(0);

      const ownerPage = await ownerAgent.get('/characters');
      expect(ownerPage).to.have.status(200);
      expect(ownerPage.text).to.include(`/characters/${characterId}/delete`);

      const otherPage = await otherAgent.get('/characters');
      expect(otherPage).to.have.status(200);
      expect(otherPage.text).not.to.include(`/characters/${characterId}/delete`);

      const denied = await otherAgent.post(`/characters/${characterId}/delete`).redirects(0);
      expect(denied).to.have.status(404);
      expect(await db.oneOrNone('SELECT character_id FROM characters WHERE character_id = $1', [characterId])).not.to.equal(null);

      const response = await ownerAgent.post(`/characters/${characterId}/delete`).redirects(0);
      expect(response).to.have.status(302);
      expect(response).to.have.header('location', '/characters');
      expect(await db.oneOrNone('SELECT character_id FROM characters WHERE character_id = $1', [characterId])).to.equal(null);
      expect(await db.oneOrNone('SELECT library_id FROM player_library WHERE character_id = $1', [characterId])).to.equal(null);
    } finally {
      ownerAgent.close();
      otherAgent.close();
    }
  });
});
