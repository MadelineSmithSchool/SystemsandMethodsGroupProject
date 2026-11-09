# Release Notes

## Week of 11/30/2026
- keep updated with what you work on in the past week (idk if we will have a meeting this week)

## Week of 11/16/2026
- keep updated with what you work on in the past week
- admin can send an alert bar from /manage that shows at the top of every page

## Week of 11/9/2026
- keep updated with what you work on in the past week
- added visibility toggle to module setting
- general housekeeping + code readabilty
- there was a lot of temporary js in template-builder.hbs, so it was moved to a 5 new .js files and overall slimmed everything down. this was a lot of work
- uploading a template now works with template studio
- created good looking error page instead of blank html 
- lab 10 tests: mocha/chai setup with its own test db in docker, tests for register and the welcome route
- npm test always runs in test mode so it cant touch the dev db
- removed the Zone.Identifier file that broke git pull on windows
- admin page (/manage) is admin only now
- admin can search users and templates from the nav search bars
- admin can delete and recover accounts (deleted accounts cant log in)
- admin can make/remove other admins and unshare templates, admin link added to nav
- shared template links stop working if the owner's account is deleted

## Week of 11/2/2026
- set up rester and sign in pages
- set up dashboard
- db
- connection to db
- created empty admin page for placeholder
- started work on modular sheet design

## Week of 10/26/2026
- Set up the repo structure (MilestoneSubmissions, ProjectSourceCode, SourceCode)
- Added docker-compose.yaml (Postgres 14 + Node) to SourceCode
- Added README with project description, team, and meeting info
- Added .gitignore
- Added a placeholder index.html page
- Added the Lab 8 deliverable to MilestoneSubmissions
