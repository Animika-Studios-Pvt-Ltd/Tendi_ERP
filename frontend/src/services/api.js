import axios from 'axios';
import { API_BASE_URL, AUTH_EVENTS } from '@/constants/app';

/**
 * Single Axios instance for the app. The session lives in an httpOnly cookie,
 * so requests only need withCredentials; no token is stored in JavaScript.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export class ApiRequestError extends Error {
  constructor({ message, status, code, details }) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Maps server validation details to { fieldName: message } for forms. */
  get fieldErrors() {
    return Object.fromEntries((this.details ?? []).filter((d) => d.field).map((d) => [d.field, d.message]));
  }
}

function normalizeError(error) {
  if (axios.isCancel(error)) return error;

  if (error.response) {
    const { status, data } = error.response;
    return new ApiRequestError({
      status,
      code: data?.error?.code ?? 'REQUEST_FAILED',
      message: data?.error?.message ?? `Request failed with status ${status}`,
      details: data?.error?.details,
    });
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiRequestError({ status: 0, code: 'TIMEOUT', message: 'The server took too long to respond. Try again.' });
  }

  return new ApiRequestError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the Ten.Di ERP server. Check your connection and that the API is running.',
  });
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeError(error);
    const isSessionCheck = error.config?.url?.includes('/auth/me') || error.config?.url?.includes('/auth/login');
    if (normalized.status === 401 && !isSessionCheck) {
      window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED));
    }
    return Promise.reject(normalized);
  },
);

/** Unwraps the { success, data, meta } envelope. */
export const unwrap = (response) => response.data;
