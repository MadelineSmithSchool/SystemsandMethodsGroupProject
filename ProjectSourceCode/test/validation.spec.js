const {expect} = require('chai');
const validateRegistration = require('../src/validateRegistration');

describe('Registration validation', () => {
  const validInput = {
    username: 'lab10_user',
    email: 'lab10@example.com',
    password: 'TestPassword123!',
  };

  it('accepts valid registration input', () => {
    expect(validateRegistration(validInput)).to.deep.equal([]);
  });

  it('rejects a missing password', () => {
    const {password, ...input} = validInput;
    expect(validateRegistration(input)).to.include(
      'Your password must be at least 8 characters long.'
    );
  });

  it('rejects an invalid email address', () => {
    expect(validateRegistration({...validInput, email: 'not-an-email'})).to.include(
      'Enter a valid email address (255 characters or fewer).'
    );
  });

  it('rejects passwords longer than 72 UTF-8 bytes', () => {
    expect(validateRegistration({...validInput, password: 'é'.repeat(37)})).to.include(
      'Your password must be no more than 72 bytes long.'
    );
  });
});
