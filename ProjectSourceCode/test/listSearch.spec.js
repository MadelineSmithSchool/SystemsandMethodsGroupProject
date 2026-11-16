// live search on the list pages (routes/list-controls.js)
// the browser script fetches the same url the search form would and swaps in [data-list-results],
// so these check the server side of that: the script is served and a search url sends back just the matches
// pgp.end() is in server.spec.js so dont add it here
const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const {randomUUID} = require('node:crypto');
const app = require('../app');
const {db} = require('../src/db');

chai.use(chaiHttp);
const {expect} = chai;

describe('Live search on the list pages', () => {
  const testUser = {
    username: `lab10_${randomUUID()}`,
    password: 'TestPassword123!',
  };
  // random names so they only match each other, not real templates in the test db
  const tag = randomUUID().slice(0, 8);
  const goblin = `goblin ${tag}`;
  const dragon = `dragon ${tag}`;

  async function removeTestData() {
    await db.none(
      'DELETE FROM templates WHERE user_id IN (SELECT user_id FROM users WHERE username = $1)',
      [testUser.username]
    );
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  before(async () => {
    await removeTestData();
    const hash = await bcrypt.hash(testUser.password, 10);
    const {user_id: userId} = await db.one(
      `INSERT INTO users (username, email, password_hash, auth_token) VALUES ($1, $2, $3, $4)
       RETURNING user_id`,
      [testUser.username, 'lab10@example.com', hash, randomUUID().replace(/-/g, '')]
    );
    for (const name of [goblin, dragon]) {
      await db.none(
        `INSERT INTO templates (template_name, template_desc, template_data, user_id, privacy_level)
         VALUES ($1, 'made by the live search test', '{}', $2, 1)`,
        [name, userId]
      );
    }
  });
  after(removeTestData);

  it('serves the live search script', async () => {
    const res = await chai.request(app).get('/js/list-controls.js');
    expect(res).to.have.status(200);
    expect(res).to.have.header('content-type', /javascript/);
  });

  it('sends back only the matching templates inside the results box', async () => {
    const agent = chai.request.agent(app);
    try {
      await agent.post('/login').type('form').send(testUser).redirects(0);

      const res = await agent.get('/library').query({q: goblin, sort: 'name'});
      expect(res).to.have.status(200);
      expect(res.text).to.include('<script src="/js/list-controls.js" defer></script>');
      expect(res.text).to.include('data-list-results');
      expect(res.text).to.include(goblin);
      expect(res.text).to.not.include(dragon);
      expect(res.text.match(/data-list-item/g)).to.have.length(1);
    } finally {
      agent.close();
    }
  });
});
