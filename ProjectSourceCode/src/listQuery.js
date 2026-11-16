// search box + sort dropdown (+ optional filter dropdown) for the list pages (?q=...&sort=...)
// used by /library, /templates and /characters
// the sort and filter can only pick one of the fixed options below, so nothing from the url goes into the sql as is

const SORTS = [
  { value: 'newest', label: 'Newest first', orderBy: (c) => `${c.created} DESC, ${c.id} DESC` },
  { value: 'oldest', label: 'Oldest first', orderBy: (c) => `${c.created} ASC, ${c.id} ASC` },
  { value: 'name', label: 'Name (A-Z)', orderBy: (c) => `LOWER(${c.name}) ASC, ${c.id} ASC` },
  { value: 'name-desc', label: 'Name (Z-A)', orderBy: (c) => `LOWER(${c.name}) DESC, ${c.id} DESC` },
];

// extra sort for lists that select a save count (columns.saves), ties go to the newer one
const MOST_SAVED = {
  value: 'most-saved',
  label: 'Most saved',
  orderBy: (c) => `${c.saves} DESC, ${c.created} DESC, ${c.id} DESC`,
};

const MAX_SEARCH_LENGTH = 100;

// % and _ are wildcards in ILIKE, escape them so searching "50%" looks for "50%"
function likePattern(search) {
  return '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
}

const toOptions = (choices, picked) => choices.map((option) => ({
  value: option.value,
  label: option.label,
  selected: option === picked,
}));

// query is req.query, columns is { name, created, id } (+ saves for MOST_SAVED) for the table being listed
// options.sorts adds sorts after the default ones
// options.filter is { name, label, options: [{ value, label }] }, read from ?<name>=, first option is the default
function listQuery(query, columns, { sorts = [], filter = null } = {}) {
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  const sortChoices = SORTS.concat(sorts);
  const sort = sortChoices.find((option) => option.value === query.sort) || sortChoices[0];
  const filterPick = filter
    ? filter.options.find((option) => option.value === query[filter.name]) || filter.options[0]
    : null;
  // true when fewer rows might show than the default view (search or filter is on)
  const filtered = search !== '' || Boolean(filter && filterPick !== filter.options[0]);

  return {
    search,
    sort: sort.value,
    pattern: likePattern(search),
    orderBy: sort.orderBy(columns),
    sortOptions: toOptions(sortChoices, sort),
    filter: filter && {
      name: filter.name,
      label: filter.label,
      value: filterPick.value,
      options: toOptions(filter.options, filterPick),
    },
    filtered,
    // true when the list isn't the default view (so the page can show a Clear link)
    active: filtered || sort !== sortChoices[0],
  };
}

module.exports = { listQuery, likePattern, SORTS, MOST_SAVED, MAX_SEARCH_LENGTH };
