# Tests (Lab 10)

Mocha + Chai + Chai HTTP. Tests run in their own containers against a separate test db (`project_test`), not the dev db.

## Setup

From `ProjectSourceCode/`:

```sh
cp .env.test.example .env.test
docker compose -p lab10-tests -f docker-compose.test.yaml run --rm --no-deps tests npm ci
```

Rerun `npm ci` if `package.json` changes.

## Run

```sh
docker compose -p lab10-tests -f docker-compose.test.yaml up --abort-on-container-exit --exit-code-from tests
docker compose -p lab10-tests -f docker-compose.test.yaml down
```

Exits 0 if everything passes. You can run it back to back, the tests clean up their own users.

To wipe the test db (like after `create.sql` changes), run this and then the setup again:

```sh
docker compose -p lab10-tests -f docker-compose.test.yaml down --volumes
```

## How it's set up

- `app.js` builds the app and exports it. `index.js` starts the server (`npm start`).
- `src/db.js` is the one db connection, used by the routes and the tests. It won't run tests unless the db name ends in `_test`.
- `test/setup.js` loads first and turns on test mode, so running `npm test` against the dev db just errors out instead of touching it.
- The test db gets its tables from `create.sql`.
- `server.spec.js` closes the db pool after all the tests finish.

## Tests

| File | Type | What it checks |
| --- | --- | --- |
| `server.spec.js` | integration | `GET /welcome` returns the welcome message |
| `validation.spec.js` | unit | `validateRegistration()`, the function `/register` uses to check input. No server or db. |
| `register.spec.js` | integration | `POST /register` with good input and with no password |
| `login.spec.js` | integration (extra credit) | `POST /login` with the right password and a wrong one |

## POST /register

- Request: form data with `username`, `email`, `password`
- Rules: username 1-50 chars, valid email, password at least 8 chars and at most 72 bytes
- Success: `302` to `/login`, one new row in `users` with `username`, `email`, `password_hash` (bcrypt), `auth_token`
- Missing password: `400`, register page shows "Your password must be at least 8 characters long.", nothing saved

The tests check the status, that exactly one row got saved with the right username and email, and that the password is stored as a bcrypt hash. The missing password test checks the error shows up and no row exists.

## POST /login

- Request: form data with `username`, `password`
- Success: `302` to the landing page with a session cookie, and that page loads (`200`)
- Wrong password: `401`, login page shows "The username or password is incorrect.", and protected pages like `/templates` still redirect to `/login`

## Cleanup

Test users are named `lab10_` + a random id. The register tests delete their user before and after each test. The login tests add their user once and delete it at the end. Nothing else in the db gets touched.
