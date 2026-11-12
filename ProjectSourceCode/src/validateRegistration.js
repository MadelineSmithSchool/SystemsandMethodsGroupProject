function validateRegistration(input) {
  const data = input && typeof input === 'object' ? input : {};
  const username = typeof data.username === 'string' ? data.username.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';
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
