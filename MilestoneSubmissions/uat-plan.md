# UAT Plan (Lab 10)

**Team 013-2 | Rocket Powered Goblins**

We plan the tests now and run them during the project testing milestone. Results stay "Not run" until then.

## Scope

1. **Registration** - As a new player, I want to make an account so I can save my character sheets.
2. **Login** - As a returning player, I want to sign in so I can get back to my dashboard, and nobody else can get in with a wrong password.
3. **Admin page (delete account)** - As an admin, I want to delete a bad account so that person can't log in anymore, and regular users can't use the admin page.

## Acceptance criteria

- **Registration:** A new user can make an account and then sign in with it. If the password is missing or too short, the user sees a message saying so and no account is made.
- **Login:** The right username and password takes the user to their dashboard. A wrong password shows an error, keeps them on the login page, and they can't open the dashboard.
- **Admin page:** After an admin deletes an account, that person sees a "deleted" message when they try to log in. A regular user who goes to `/manage` just sees "Not found."

## Environment

- Localhost: in `ProjectSourceCode/`, run `docker compose up`, then open http://localhost:3001
- Browser: Chrome on a laptop (write down the browser and version when you run it)
- Version: write down the commit hash being tested (`git rev-parse --short HEAD`) when you run it
- Admin account: register one, then follow "Admin page" in the main README to make it an admin

## Testers

- Who: people who play or have played tabletop RPGs and have not worked on this app. If we can't find enough of those, classmates from other CSCI 3308 teams will act as proxies. Since they're not our real users, we'll note that in the results.
- Coordinator: Lucas Moraca finds testers and sets up the times.
- Planned tester IDs: T1, T2, T3. We only use these IDs in the results, no names.

## Test cases

| Test ID | Feature / requirement | Acceptance criterion | Preconditions | Test data | User steps | Expected result | Tester ID | Actual result | Status | Issue / follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-01 | Registration / account creation | A new user can make an account and then sign in | Register page is open; user is signed out | Username: `uat_player1` (not taken), email: `uat1@example.com`, password: `Goblins123!` | 1. Enter username. 2. Enter email. 3. Enter password. 4. Submit. 5. Log in with the same username and password. | After step 4 the user lands on the login page. After step 5 they land on their dashboard. | Planned: T1 | Not run | Not run | None yet |
| UAT-02 | Registration / account creation | Missing password gets clear feedback and no account is made | Register page is open; user is signed out | Username: `uat_player2` (not taken), email: `uat2@example.com`, password left blank | 1. Enter username. 2. Enter email. 3. Leave password blank. 4. Submit. 5. Go to the login page and try to log in as `uat_player2` with any password. | After step 4 the user stays on the register page and sees "Your password must be at least 8 characters long." After step 5 login fails, so no account was made. | Planned: T1 | Not run | Not run | None yet |
| UAT-03 | Login | The right username and password takes the user to their dashboard | Account `uat_player1` / `Goblins123!` exists (from UAT-01); user is signed out | Username: `uat_player1`, password: `Goblins123!` | 1. Open the login page. 2. Enter username. 3. Enter password. 4. Submit. | The user lands on the dashboard and the nav shows them as logged in. | Planned: T2 | Not run | Not run | None yet |
| UAT-04 | Login | A wrong password can't get into the dashboard | Account `uat_player1` exists; user is signed out | Username: `uat_player1`, password: `WrongPass999` | 1. Open the login page. 2. Enter username. 3. Enter the wrong password. 4. Submit. 5. Type http://localhost:3001/dashboard into the address bar. | After step 4 the user stays on the login page and sees "The username or password is incorrect. Check your details and try again." After step 5 they get sent back to the login page. | Planned: T2 | Not run | Not run | None yet |
| UAT-05 | Admin page / delete account | A deleted account can't log in | Tester is logged in as an admin; account `uat_player1` exists | Account to delete: `uat_player1` (password `Goblins123!`) | 1. Click "Admin" in the nav. 2. Type `uat_player1` in "Search users" and press Enter. 3. Click "Delete" on that row and confirm. 4. Log out. 5. Log in as `uat_player1` / `Goblins123!`. | After step 3 the row shows "Deleted" with today's date. After step 5 the user stays on the login page and sees "This account has been deleted. Ask an admin if you want it back." | Planned: T3 | Not run | Not run | None yet |
| UAT-06 | Admin page / delete account | Regular users can't use the admin page | Tester is logged in as a regular (non-admin) user | Any regular account, like `uat_player1` after it's recovered, or a new one | 1. Check the nav for an "Admin" link. 2. Type http://localhost:3001/manage into the address bar. | There's no "Admin" link in the nav, and `/manage` just shows "Not found." | Planned: T3 | Not run | Not run | None yet |

## After running

Fill in Actual result, mark each case Pass, Fail, or Blocked, and write any issues in the last column. If we fix something, run the case again and write down how the retest went. Only write down what actually happened.
