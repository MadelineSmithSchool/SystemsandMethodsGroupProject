// live search for the list pages (/library, /templates, /characters)
// typing in the search box or changing a dropdown reloads just the results, no page refresh
// it asks the server for the same page the form would load and swaps in the new results,
// so search + sort still happen in sql (src/listQuery.js). without js the form works like before
(function () {
  const form = document.querySelector('[data-list-controls]');
  const results = document.querySelector('[data-list-results]');
  if (!form || !results || !window.fetch || !window.DOMParser) return;

  const actions = form.querySelector('.list-controls-actions');
  const status = form.querySelector('[data-list-status]');
  const TYPING_DELAY = 300; // ms to wait after the last key before searching

  let shownUrl = location.pathname + location.search;
  let request = null;
  let timer = null;

  // same url the form would go to on submit, minus an empty search
  function formUrl() {
    const params = new URLSearchParams(new FormData(form));
    const search = (params.get('q') || '').trim();
    if (search) params.set('q', search);
    else params.delete('q');
    const query = params.toString();
    return form.getAttribute('action') + (query ? '?' + query : '');
  }

  function describe(container) {
    const count = container.querySelectorAll('[data-list-item]').length;
    if (count === 0) return container.textContent.trim().replace(/\s+/g, ' ');
    return count === 1 ? '1 result' : count + ' results';
  }

  // the Clear link only shows when the list isn't the default view
  // add/remove just the link (not the whole button row) so the Search button keeps keyboard focus
  function showClearLink(newClear) {
    if (!actions) return;
    const clear = actions.querySelector('a');
    if (newClear && !clear) actions.append(newClear);
    if (!newClear && clear) clear.remove();
  }

  async function update() {
    clearTimeout(timer);
    const url = formUrl();
    if (request) request.abort(); // only the newest search gets shown
    if (url === shownUrl) return; // typed back to what's already on screen (the abort above drops the old search)

    const thisRequest = new AbortController();
    request = thisRequest;
    results.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, { signal: thisRequest.signal, headers: { Accept: 'text/html' } });
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const newResults = page.querySelector('[data-list-results]');
      // logged out (sent to /login), an error page, or anything else odd: just load the page for real
      if (!response.ok || response.redirected || !newResults) {
        location.assign(url);
        return;
      }

      results.innerHTML = newResults.innerHTML;
      showClearLink(page.querySelector('[data-list-controls] .list-controls-actions a'));
      // a "could not load" message from the first page load is out of date now
      document.querySelectorAll('[data-list-error]').forEach((message) => message.remove());
      history.replaceState(null, '', url); // refresh or share the url and you get the same list
      shownUrl = url;
      if (status) status.textContent = describe(results);
    } catch (error) {
      if (error.name !== 'AbortError') location.assign(url);
    } finally {
      if (request === thisRequest) {
        request = null;
        results.removeAttribute('aria-busy');
      }
    }
  }

  form.addEventListener('input', (event) => {
    if (event.target.name !== 'q') return;
    clearTimeout(timer);
    timer = setTimeout(update, TYPING_DELAY);
  });
  form.addEventListener('change', (event) => {
    if (event.target.tagName === 'SELECT') update();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    update();
  });
}());
