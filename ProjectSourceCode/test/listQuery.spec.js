// unit tests for the search + sort helper, no server or db needed
const {expect} = require('chai');
const {listQuery, likePattern, MAX_SEARCH_LENGTH} = require('../src/listQuery');

const columns = {name: 't.template_name', created: 't.created_at', id: 't.template_id'};

describe('List search and sort', () => {
  it('defaults to newest first with no search', () => {
    const list = listQuery({}, columns);
    expect(list.search).to.equal('');
    expect(list.sort).to.equal('newest');
    expect(list.pattern).to.equal('%%');
    expect(list.orderBy).to.equal('t.created_at DESC, t.template_id DESC');
    expect(list.active).to.equal(false);
    expect(list.sortOptions.filter((option) => option.selected).map((option) => option.value)).to.deep.equal(['newest']);
  });

  it('trims the search and uses a known sort', () => {
    const list = listQuery({q: '  goblin  ', sort: 'name'}, columns);
    expect(list.search).to.equal('goblin');
    expect(list.pattern).to.equal('%goblin%');
    expect(list.orderBy).to.equal('LOWER(t.template_name) ASC, t.template_id ASC');
    expect(list.active).to.equal(true);
  });

  it('ignores an unknown sort instead of putting it in the sql', () => {
    const list = listQuery({sort: 't.created_at; DROP TABLE users'}, columns);
    expect(list.sort).to.equal('newest');
    expect(list.orderBy).to.not.include('DROP');
  });

  it('ignores a search that is not a single string and cuts long ones', () => {
    expect(listQuery({q: ['a', 'b']}, columns).search).to.equal('');
    expect(listQuery({q: 'x'.repeat(500)}, columns).search).to.have.length(MAX_SEARCH_LENGTH);
  });

  it('escapes ILIKE wildcards so they match literally', () => {
    expect(likePattern('50%_off\\')).to.equal('%50\\%\\_off\\\\%');
  });
});
