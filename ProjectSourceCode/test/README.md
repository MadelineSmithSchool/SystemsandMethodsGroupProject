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

- `app.js` exports the app. It only starts the server when you run it directly (`npm start` / `nodemon app.js`), so the tests can require it without starting one.
- `src/db.js` is the one db connection, used by the routes and the tests. It won't run tests unless the db name ends in `_test`.
- `test/setup.js` loads first and turns on test mode, so running `npm test` against the dev db just errors out instead of touching it.
- The test db gets its tables from `create.sql`.
- `server.spec.js` closes the db pool after all the tests finish.

## Tests

| File | What it checks |
| --- | --- |
| `server.spec.js` | `GET /welcome` returns the welcome message |
| `validation.spec.js` | Unit test: `src/validateRegistration.js` with good input and with no password (no server or db) |
| `register.spec.js` | `POST /register` with good input and with no password |
| `login.spec.js` | Extra credit: `POST /login` with the right password (redirects to `/dashboard` and the dashboard loads) and the wrong one (renders login with an error, `401`) |

## POST /register

- Request: form data with `username`, `email`, `password`
- Rules: username 1-50 chars, valid email, password at least 8 chars and at most 72 bytes. These live in `src/validateRegistration.js`, which the route calls before hashing or saving anything
- Success: `302` to `/login`, one new row in `users` with `username`, `email`, `password_hash` (bcrypt), `auth_token`
- Missing password: `400`, register page shows "Your password must be at least 8 characters long.", nothing saved

The good input test checks the status, that exactly one row got saved with the right username and email, and that the password is stored as a bcrypt hash. The missing password test checks the error shows up and no row exists.

## Cleanup

The test user is named `lab10_` + a random id. It gets deleted before and after each test. Nothing else in the db gets touched.
