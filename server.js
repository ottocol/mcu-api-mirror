// Espejo mínimo del endpoint /api/v1/movies de MCUAPI (https://github.com/AugustoMarcelo/mcuapi)
// Sin dependencias: solo Node >= 18. Sin rate limit.
//
//   GET /api/v1/movies?title=iron&page=1&limit=10
//   GET /api/v1/movies?filter=title=iron&page=1&limit=10   (sintaxis de la API original)
//   GET /api/v1/movies/{id}
//   GET /health

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3333;
const ORIGINAL_BASE = 'https://mcuapi.up.railway.app';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const movies = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'movies.json'), 'utf8'),
).sort((a, b) => a.id - b.id);

// Columnas filtrables como en la API original: 'text' = contiene (sin distinguir
// mayúsculas, como ILIKE '%valor%'), 'exact' = igualdad.
const COLUMNS = {
  id: 'exact', title: 'text', release_date: 'exact', box_office: 'exact',
  duration: 'exact', overview: 'text', cover_url: 'text', trailer_url: 'text',
  directed_by: 'text', phase: 'exact', saga: 'text', chronology: 'exact',
  post_credit_scenes: 'exact', imdb_id: 'text', studio: 'text',
  continuity: 'text', multiverse_designation: 'text', is_mcu: 'exact',
  type: 'text', timeline_chronology_order: 'exact', updated_at: 'exact',
};

class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

function positiveInt(value, name) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return Number(value);
}

function parseFilter(raw) {
  return raw.split(';').map(c => c.trim()).filter(Boolean).map(clause => {
    const [column, ...rest] = clause.split('=');
    const value = rest.join('=').trim();
    if (!COLUMNS[column.trim()] || !value) {
      throw new HttpError(400, 'filter must use supported columns with non-empty values');
    }
    return { column: column.trim(), value };
  });
}

function matches(movie, { column, value }) {
  const field = movie[column];
  if (field === null || field === undefined) return false;
  if (COLUMNS[column] === 'exact') return String(field) === value;
  return String(field).toLowerCase().includes(value.toLowerCase());
}

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// Los registros traen _links apuntando a Railway. Reescribimos solo los de
// películas (los que sirve este espejo); characters y post-credit-scenes
// siguen apuntando a la API original.
function present(movie, base) {
  const moviesPrefix = `${ORIGINAL_BASE}/api/v1/movies`;
  return JSON.parse(
    JSON.stringify(movie).split(moviesPrefix).join(`${base}/api/v1/movies`),
  );
}

function pageUrl(base, query, page, limit) {
  const params = new URLSearchParams();
  [...query.keys()].sort().forEach(k => {
    if (k !== 'page' && k !== 'limit') params.set(k, query.get(k));
  });
  params.set('limit', String(limit));
  params.set('page', String(page));
  return `${base}/api/v1/movies?${params}`;
}

function listMovies(req, url) {
  const q = url.searchParams;
  const page = q.has('page') ? positiveInt(q.get('page'), 'page') : DEFAULT_PAGE;
  const limit = q.has('limit') ? positiveInt(q.get('limit'), 'limit') : DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) throw new HttpError(400, `limit must not exceed ${MAX_LIMIT}`);

  const clauses = [];
  if (q.has('filter')) clauses.push(...parseFilter(q.get('filter')));
  if (q.has('title')) {
    const title = q.get('title').trim();
    if (!title) throw new HttpError(400, 'title must not be empty');
    clauses.push({ column: 'title', value: title });
  }

  const filtered = movies.filter(m => clauses.every(c => matches(m, c)));
  const total = filtered.length;
  const base = baseUrl(req);
  const lastPage = Math.max(1, Math.ceil(total / limit));

  const _links = {
    self: { href: pageUrl(base, q, page, limit) },
    first: { href: pageUrl(base, q, 1, limit) },
    last: { href: pageUrl(base, q, lastPage, limit) },
  };
  if (page > 1) _links.prev = { href: pageUrl(base, q, page - 1, limit) };
  if (page * limit < total) _links.next = { href: pageUrl(base, q, page + 1, limit) };

  return {
    data: filtered.slice((page - 1) * limit, page * limit).map(m => present(m, base)),
    total,
    page,
    limit,
    _links,
  };
}

function showMovie(req, idRaw) {
  const id = positiveInt(idRaw, 'movie_id');
  const movie = movies.find(m => m.id === id);
  if (!movie) throw new HttpError(404, 'Movie not found');
  return present(movie, baseUrl(req));
}

const TITLES = { 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error' };

function send(res, status, body, type = 'application/json') {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': status === 200 ? 'public, max-age=3600' : 'no-store',
  });
  res.end(res.req.method === 'HEAD' ? undefined : payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD' });
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Only GET is supported');

    if (route === '/health') return send(res, 200, { status: 'ok', movies: movies.length });
    if (route === '/api/v1/movies') return send(res, 200, listMovies(req, url));
    const detail = route.match(/^\/api\/v1\/movies\/([^/]+)$/);
    if (detail) return send(res, 200, showMovie(req, detail[1]));

    throw new HttpError(404, `Route ${route} not found`);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    send(res, status, {
      type: 'about:blank',
      title: TITLES[status] || 'Error',
      status,
      detail: status === 500 ? 'Internal server error' : err.message,
      instance: req.url,
    }, 'application/problem+json');
  } finally {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode}`);
  }
});

server.listen(PORT, () => {
  console.log(`MCU mirror: ${movies.length} películas en http://localhost:${PORT}/api/v1/movies`);
});
