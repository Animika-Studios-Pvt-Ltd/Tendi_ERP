import { ApiError } from '../utils/ApiError.js';

export function formatZodIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
}

/**
 * Validates request parts against Zod schemas: validate({ body, query, params }).
 * Parsed values are stored on req.validated (Express 5 makes req.query read-only);
 * req.body is also replaced so unknown keys are stripped.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = req.validated ?? {};
    const issues = [];

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        req.validated[part] = result.data;
      } else {
        issues.push(...result.error.issues);
      }
    }

    if (issues.length) throw ApiError.validation(formatZodIssues(issues));
    if (req.validated.body) req.body = req.validated.body;
    next();
  };
}
