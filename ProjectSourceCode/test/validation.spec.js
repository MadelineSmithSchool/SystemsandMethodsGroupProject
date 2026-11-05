// unit tests, no server or db
const {expect} = require('chai');
const validateRegistration = require('../src/validateRegistration');

describe('Registration validation (unit)', () => {
  const valid = {username: 'student', email: 'student@example.com', password: 'TestPassword123!'};

  it('accepts a valid username, email, and password', () => {
    expect(validateRegistration(valid).errors).to.deep.equal([]);
  });

  it('rejects a missing password', () => {
    const {errors} = validateRegistration({username: 'student', email: 'student@example.com'});
    expect(errors).to.deep.equal(['Your password must be at least 8 characters long.']);
  });

  it('rejects a password longer than 72 bytes', () => {
    const {errors} = validateRegistration({...valid, password: 'a'.repeat(73)});
    expect(errors).to.deep.equal(['Your password must be no more than 72 bytes long.']);
  });

  it('rejects an invalid email', () => {
    const {errors} = validateRegistration({...valid, email: 'not-an-email'});
    expect(errors).to.deep.equal(['Enter a valid email address (255 characters or fewer).']);
  });

  it('trims whitespace from username and email', () => {
    const result = validateRegistration({...valid, username: '  student  ', email: ' student@example.com '});
    expect(result.username).to.equal('student');
    expect(result.email).to.equal('student@example.com');
    expect(result.errors).to.deep.equal([]);
  });
});
