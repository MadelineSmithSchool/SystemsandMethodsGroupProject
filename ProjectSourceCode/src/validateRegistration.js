// register form rules, used by POST /register and the unit test
// returns a list of error messages, empty means its good
function validateRegistration({ username, email, password }) {
  const errors = [];

  if (!username) {
    errors.push('Enter a username.');
  } else if (username.length > 50) {
    errors.push('Your username must be 50 characters or fewer.');
  }

  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Enter a valid email address (255 characters or fewer).');
  }

  if (password.length < 8) {
    errors.push('Your password must be at least 8 characters long.');
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Your password must be no more than 72 bytes long.');
  }

  return errors;
}

module.exports = validateRegistration;
