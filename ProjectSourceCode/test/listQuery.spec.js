// unit tests for the search + sort helper, no server or db needed
const {expect} = require('chai');
const {listQuery, likePattern, MOST_SAVED, MAX_SEARCH_LENGTH} = require('../src/listQuery');

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

  it('only allows "most saved" on lists that add it', () => {
    const withSaves = {...columns, saves: 'times_saved'};
    const library = listQuery({sort: 'most-saved'}, withSaves, {sorts: [MOST_SAVED]});
    expect(library.sort).to.equal('most-saved');
    expect(library.orderBy).to.equal('times_saved DESC, t.created_at DESC, t.template_id DESC');
    expect(library.sortOptions.map((option) => option.value)).to.include('most-saved');
    expect(listQuery({sort: 'most-saved'}, columns).sort).to.equal('newest');
  });

  it('reads a filter from the url and falls back to its first option', () => {
    const filter = {name: 'show', label: 'Show', options: [{value: 'all', label: 'All'}, {value: 'saved', label: 'Saved'}]};
    const plain = listQuery({}, columns, {filter});
    expect(plain.filter.value).to.equal('all');
    expect(plain.filtered).to.equal(false);
    expect(plain.active).to.equal(false);

    const saved = listQuery({show: 'saved'}, columns, {filter});
    expect(saved.filter.value).to.equal('saved');
    expect(saved.filter.options.filter((option) => option.selected).map((option) => option.value)).to.deep.equal(['saved']);
    expect(saved.filtered).to.equal(true);
    expect(saved.active).to.equal(true);

    expect(listQuery({show: 'everything; DROP TABLE users'}, columns, {filter}).filter.value).to.equal('all');
    expect(listQuery({}, columns).filter).to.equal(null);
  });
});
