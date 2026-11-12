UAT plan

1 scope, acceptance criteria

### UAT-01 - registration and sign-in
  As a new player, I can register and sign in so I can use account features.
  Acceptance Criteria: A new user can create an account, get redirected to login, and sign in to reach the dashboard, submitting a blank password blocks sign-up with error 


### UAT-02- character dashboard
   As a signed-in player, I can start a character sheet and add an ability-score card
  Acceptance Criteria: Starting from scratch opens the character workspace with the chosen name and updates modifiers accurately (ie, Strength 16 displays3). Clicking "Work on a previous template" with no saved templates shows error

### UAT-03 - template upload
  As a signed-in player, I can import a JSON template into the builder and get clear feedback for an invalid file
  AC: Uploading a valid JSON file opens the template builder with its stat modules loaded and the template title prefilled on save. Uploading malformed JSON keeps the user on the upload page and displays a clear JSON error

2 Schedule + test approach
Run during the project testing milestone, before the final project report. Confirm the exact testing date with our project schedule and TA before recruiting testers.
Testers will walk through all six cases in one sitting using the exact test data below. A teammate who didn't build the feature will coordinate the session and log results without changing expected outcomes mid-test. If any test fails, we'll fix the issue and re-run that case

3 env and set up

URL: http://localhost:3001
Setup: From ProjectSourceCode/, start the stack with docker compose up -d using  standard local .env file (do not use the disposable Lab 10 test database). Verify the web app responds and the database is healthy before testing.
Browser: Current stable desktop Chrome or Firefox on a laptop or desktop with a keyboard and mouse *(record the exact browser and version during testing)*.


4. Testers

target users:  People who play or are interested in tabletop RPGs, including users unfamiliar with our interface.
coordination: A group member who wasn't the primary developer for the feature will run the session and record results. We will recruit testers outside our team when feasible; if classmates have to act as proxies, we'll document that limitation with the results.
tester ids: T1 and T2 (outside TTRPG players); T3 (backup classmate). Assign real testers to these IDs before testing ?


Results fields:

<!-- sorry my table from my notes app copied and pasted weird, I wanted to make sure the template was the same from the instructions -->

| test id | feature / requirement | acceptance criterion | preconditions | test data | user steps | expected result | tester id | actual result | status | issue / follow-up |
|---|---|---|---|---|---|---|---|---|---|---|
| uat-01 | registration and sign-in | new user can register, be sent to login, and sign in | signed out; /register open; username uat_player1 not already registered | username: uat_player1<br>email: uat_player1@example.com<br>password: uatpass123! | 1 enter username, email and password<br>2 submit<br>3 on the login page enter the same username and password<br>4 submit<br>5 open the dashboard from the home page or nav bar | after step 2 user lands on the login page<br>after step 4 user is signed in<br>after step 5 the dashboard opens | planned: t1, t2 | not run | not run | none yet |

<!-- validate registration test in files -->
| uat-02 | registration and sign-in | blank password blocks sign-up with an error | signed out; /register open; username uat_player2 not already registered | username: uat_player2<br>email: uat_player2@example.com<br>password: (left blank) | 1 enter username<br>2 enter email<br>3 leave password blank<br>4 submit | registration does not complete<br>user stays on the register page<br>message identifies the password as the problem | planned: t1, t2 | not run | not run | none yet |

| uat-03 | character dashboard | starting from scratch opens the workspace with the chosen name; modifier updates accurately | signed in as uat_player1; dashboard start screen open | character name: uat hero<br>strength score: 16 | 1 click "build from scratch"<br>2 type the name in the character name field<br>3 click "add" next to strength in the cards panel<br>4 set the strength score to 16 | workspace opens<br>name field shows "uat hero"<br>strength card appears<br>modifier reads +3 | planned: t1, t2 | not run | not run | none yet |

<!-- extra credit plan -->
| uat-04 | character dashboard | no saved templates shows a clear message | signed in as a user with no saved templates; dashboard start screen open | none | 1 click "work on a previous template" | a list opens with a clear message that there are no saved templates<br>no broken or empty list<br>user can cancel back to the start options | planned: t1, t2 | not run | not run | none yet |

| uat-05 | template upload | valid json opens the builder with modules loaded and title prefilled | signed in as uat_player1; upload template page open | file: valid-template.json (exported from the builder, title "uat sample template", includes a strength module) | 1 open the upload template page<br>2 choose valid-template.json<br>3 click upload<br>4 check the builder<br>5 start saving the template | builder opens with the strength module on the canvas<br>title field is prefilled with "uat sample template" when saving | planned: t1, t2 | not run | not run | none yet |

| uat-06 | template upload | malformed json keeps the user on the upload page with a clear error | signed in as uat_player1; upload template page open | file: broken-template.json (copy of valid-template.json with the final closing brace deleted) | 1 open the upload template page<br>2 choose broken-template.json<br>3 click upload | user stays on the upload page<br>message clearly says the file is not valid json<br>builder does not open | planned: t1, t2 | not run | not run | none yet |

## 6 results
- actual result, status and issue / follow-up stay "not run" until testing
- status values: pass, fail, blocked
- after testing: fill in the table, record retest outcomes, include the completed plan in the final report
