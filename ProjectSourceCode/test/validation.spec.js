// unit tests for the register rules, no server or db needed
const {expect} = require('chai');
const validateRegistration = require('../src/validateRegistration');

describe('Registration validation', () => {
  it('accepts a good username, email, and password', () => {
    const errors = validateRegistration({username: 'student', email: 'student@example.com', password: 'TestPassword123!'});
    expect(errors).to.deep.equal([]);
  });

  it('rejects a missing password', () => {
    const errors = validateRegistration({username: 'student', email: 'student@example.com', password: ''});
    expect(errors).to.deep.equal(['Your password must be at least 8 characters long.']);
  });
});
