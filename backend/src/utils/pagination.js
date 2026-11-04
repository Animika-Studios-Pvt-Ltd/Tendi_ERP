const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parses ?page=&limit=&sort= into Mongo-friendly options.
 * `sort` accepts a comma list such as "-createdAt,name"; only allowedSortFields are honoured.
 */
export function parsePagination(query = {}, { allowedSortFields = ['createdAt'], defaultSort = '-createdAt' } = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const sort = {};
  for (const token of String(query.sort || defaultSort).split(',')) {
    const field = token.replace(/^-/, '').trim();
    if (allowedSortFields.includes(field)) sort[field] = token.startsWith('-') ? -1 : 1;
  }
  if (Object.keys(sort).length === 0) sort.createdAt = -1;

  return { page, limit, skip: (page - 1) * limit, sort };
}

export function buildPaginationMeta({ total, page, limit }) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/** Runs a paginated find + count in parallel for a model and filter. */
export async function paginate(model, filter, { page, limit, skip, sort }, { select, populate, lean = true } = {}) {
  let cursor = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) cursor = cursor.select(select);
  if (populate) cursor = cursor.populate(populate);
  if (lean) cursor = cursor.lean();

  const [items, total] = await Promise.all([cursor, model.countDocuments(filter)]);
  return { items, meta: buildPaginationMeta({ total, page, limit }) };
}
