// Template file format + temporary storage for uploaded templates.
//
// A template file is JSON shaped like ProjectSourceCode/examples/goblin-rogue.json:
//   {
//     "name": "Snik the Goblin Rogue",    required, up to 100 characters
//     "description": "...",               optional
//     "stats": { "strength": 8, ... },    required, stat name -> number
//     "minorStats": { "stealth": 6 }      optional, stat name -> number
//   }
// Stat names are free-form so templates work for any TTRPG, not just D&D.
//
// TODO(database): templates are kept in memory until the templates table
// exists, so they vanish when the server restarts. Swap the store functions at
// the bottom of this file for pg-promise queries; routes only use the exports.
// Suggested table:
//
//   CREATE TABLE templates (
//     id         SERIAL PRIMARY KEY,
//     owner_id   INT REFERENCES users(id),  -- null until login is wired up
//     name       VARCHAR(100) NOT NULL,
//     data       JSONB NOT NULL,            -- the parsed template (see above)
//     created_at TIMESTAMP NOT NULL DEFAULT NOW()
//   );

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_STATS = 50;
const STAT_NAME_PATTERN = /^[A-Za-z0-9 _'()-]{1,40}$/;

// Thrown for anything wrong with an uploaded file; the message is shown to the user.
class TemplateFormatError extends Error {}

function parseStats(value, field, required) {
  if (value === undefined && !required) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TemplateFormatError(`"${field}" must be an object of stat names to numbers.`);
  }

  const entries = Object.entries(value);
  if (required && entries.length === 0) {
    throw new TemplateFormatError(`"${field}" needs at least one stat.`);
  }
  if (entries.length > MAX_STATS) {
    throw new TemplateFormatError(`"${field}" can have at most ${MAX_STATS} stats.`);
  }

  for (const [name, number] of entries) {
    if (!STAT_NAME_PATTERN.test(name)) {
      throw new TemplateFormatError(
        `Stat name "${name.slice(0, 40)}" in "${field}" can only use letters, numbers, spaces, and _'()- (max 40 characters).`
      );
    }
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new TemplateFormatError(`"${field}.${name}" must be a number.`);
    }
  }

  // fromEntries (not obj[key] = ...) so a key like "__proto__" stays a plain key.
  return Object.fromEntries(entries);
}

// Turns the text of an uploaded file into a clean template object, keeping only known fields.
function parseTemplate(text) {
  let raw;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    throw new TemplateFormatError('That file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TemplateFormatError('A template file must contain a single JSON object.');
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new TemplateFormatError(`"name" is required (up to ${MAX_NAME_LENGTH} characters).`);
  }

  if (raw.description !== undefined && typeof raw.description !== 'string') {
    throw new TemplateFormatError('"description" must be text.');
  }
  const description = (raw.description || '').trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new TemplateFormatError(`"description" can be at most ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  return {
    name,
    description,
    stats: parseStats(raw.stats, 'stats', true),
    minorStats: parseStats(raw.minorStats, 'minorStats', false),
  };
}

// ---------- Store (in memory for now, see TODO at the top) ----------

const templates = new Map();
let nextId = 1;

async function create(ownerId, data) {
  const template = { id: nextId++, owner_id: ownerId, name: data.name, data, created_at: new Date() };
  templates.set(template.id, template);
  return template;
}

async function findById(id) {
  return templates.get(id) || null;
}

module.exports = { TemplateFormatError, parseTemplate, create, findById };
