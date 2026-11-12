// search box + sort dropdown for the list pages (?q=...&sort=...)
// used by /library, /templates and /characters
// the sort can only pick one of these fixed ORDER BYs, so nothing from the url goes into the sql as is

const SORTS = [
  { value: 'newest', label: 'Newest first', orderBy: (c) => `${c.created} DESC, ${c.id} DESC` },
  { value: 'oldest', label: 'Oldest first', orderBy: (c) => `${c.created} ASC, ${c.id} ASC` },
  { value: 'name', label: 'Name (A-Z)', orderBy: (c) => `LOWER(${c.name}) ASC, ${c.id} ASC` },
  { value: 'name-desc', label: 'Name (Z-A)', orderBy: (c) => `LOWER(${c.name}) DESC, ${c.id} DESC` },
];

const MAX_SEARCH_LENGTH = 100;

// % and _ are wildcards in ILIKE, escape them so searching "50%" looks for "50%"
function likePattern(search) {
  return '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
}

// query is req.query, columns is { name, created, id } for the table being listed
function listQuery(query, columns) {
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  const sort = SORTS.find((option) => option.value === query.sort) || SORTS[0];

  return {
    search,
    sort: sort.value,
    pattern: likePattern(search),
    orderBy: sort.orderBy(columns),
    // true when the list isn't showing the default view (so the page can show a Clear link)
    active: search !== '' || sort !== SORTS[0],
    sortOptions: SORTS.map((option) => ({
      value: option.value,
      label: option.label,
      selected: option === sort,
    })),
  };
}

module.exports = { listQuery, likePattern, SORTS, MAX_SEARCH_LENGTH };
