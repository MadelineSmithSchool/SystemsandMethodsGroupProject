// register form checks, pulled out of the route so we can unit test them
// returns the cleaned up values + a list of errors (empty = good)
function validateRegistration(input) {
  const body = input || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = [];

  if (!username) {
    errors.push('Enter a username.');
  } else if (username.length > 50) {
    errors.push('Your username must be 50 characters or fewer.');
  }

  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Enter a valid email address (255 characters or fewer).');
  }

  // bcrypt only looks at the first 72 bytes
  if (password.length < 8) {
    errors.push('Your password must be at least 8 characters long.');
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Your password must be no more than 72 bytes long.');
  }

  return { username, email, password, errors };
}

module.exports = validateRegistration;
