const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

describe('Production sessions behind a proxy', () => {
  it('sets a secure cookie for HTTPS and keeps the user logged in', async () => {
    const script = `
      const assert = require('assert');
      const chai = require('chai');
      chai.use(require('chai-http'));
      const bcrypt = require('bcryptjs');
      const app = require('./app');
      const { db, pgp } = require('./src/db');

      const user = {
        user_id: 1,
        username: 'test-user',
        password_hash: bcrypt.hashSync('test-password', 10),
        is_admin: false,
      };
      db.oneOrNone = async (query) => query.includes('site_alerts') ? null : user;

      (async () => {
        const credentials = { username: user.username, password: 'test-password' };
        const login = await chai.request(app).post('/login')
          .set('X-Forwarded-Proto', 'https').type('form').send(credentials).redirects(0);
        assert.strictEqual(login.status, 302);
        assert.strictEqual(login.headers.location, '/dashboard');
        const cookies = login.headers['set-cookie'];
        assert.ok(cookies && cookies.length === 1);
        assert.match(cookies[0], /; Secure/i);
        assert.match(cookies[0], /; HttpOnly/i);
        assert.match(cookies[0], /; SameSite=Lax/i);

        const dashboard = await chai.request(app).get('/dashboard')
          .set('X-Forwarded-Proto', 'https')
          .set('Cookie', cookies[0].split(';')[0]).redirects(0);
        assert.strictEqual(dashboard.status, 200);

        const insecure = await chai.request(app).post('/login')
          .type('form').send(credentials).redirects(0);
        assert.strictEqual(insecure.status, 302);
        assert.strictEqual(insecure.headers['set-cookie'], undefined);
      })().then(() => pgp.end(), (error) => {
        console.error(error);
        pgp.end();
        process.exitCode = 1;
      });
    `;

    await execFileAsync(process.execPath, ['-e', script], {
      cwd: require('path').join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'test-session-secret' },
    });
  });
});
