// CrestX API client — replicates lib/common_network/api_service.dart exactly:
// POST {scheme}://{host}/{apiEndpoint} with the ApiRequest/ApiContext/ApiMandatoryParams envelope.
import { ACTIVE_SETTINGS, ENDPOINTS, API_CONTEXT_STATIC, TXN } from './config.js';
import { Session } from './session.js';
import { recordApiCall } from './apiActivity.js';

export class ApiError extends Error {
  constructor({ error, code, details }) {
    super(details || error || 'Unknown error occured, please try again.');
    this.shortMessage = error || 'Unknown error occured, please try again.';
    this.code = code || '';
    this.details = details || '';
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
function formatCreatedOn(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildUrl(apiEndpoint) {
  return `${ACTIVE_SETTINGS.scheme}://${ACTIVE_SETTINGS.host}/${apiEndpoint}`;
}

async function rawPost(apiEndpoint, txnId, mandParams, addParams) {
  const body = {
    ApiRequest: {
      ApiContext: {
        ...API_CONTEXT_STATIC,
        txnId,
        username: Session.getUsername(),
        createdOn: formatCreatedOn(new Date()),
      },
      ApiMandatoryParams: mandParams || {},
      ApiAdditionalParams: addParams || {},
    },
  };

  let resp;
  try {
    resp = await fetch(buildUrl(apiEndpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        token: Session.getToken(),
        applicationId: ACTIVE_SETTINGS.applicationId,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError({ error: 'Something went wrong.', code: '', details: 'Unable to Communicate' });
  }

  let decoded;
  try {
    decoded = await resp.json();
  } catch (e) {
    throw new ApiError({ error: 'Something went wrong.', code: '', details: 'Invalid server response' });
  }

  const apiResponse = decoded && decoded.ApiResponse;
  const ctx = apiResponse && apiResponse.ApiResponseContext;
  if (!ctx) return {};

  if (ctx.status === 'error') {
    let apiError = apiResponse.ApiErrors;
    if (Array.isArray(apiError)) apiError = apiError[0];
    apiError = apiError || {};
    throw new ApiError({
      error: apiError.shortmsg ? apiError.shortmsg : 'Unknown error occured, please try again.',
      code: apiError.code != null ? String(apiError.code) : '',
      details: apiError.detailmsg || '',
    });
  }
  if (ctx.status === 'success') {
    return apiResponse.ApiResponseData || {};
  }
  return {};
}

async function timeDifferenceInMinutes() {
  const expiry = Session.getTokenExpiryTime();
  if (!expiry) return -1;
  return Math.round((expiry - Date.now()) / 60000);
}

async function handleRefreshToken() {
  try {
    const resp = await fetch(buildUrl(ENDPOINTS.refreshToken), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        token: Session.getToken(),
        applicationId: ACTIVE_SETTINGS.applicationId,
      },
      body: JSON.stringify({}),
    });
    const decoded = await resp.json();
    const ctx = decoded && decoded.ApiResponse && decoded.ApiResponse.ApiResponseContext;
    if (ctx && ctx.status === 'success') {
      const data = decoded.ApiResponse.ApiResponseData || {};
      if (data.token) {
        Session.setToken(data.token);
        const expiry = data.expiry ? new Date(data.expiry).getTime() : Date.now();
        Session.setTokenExpiryTime(expiry);
      }
    }
  } catch (e) {
    // Best-effort background refresh — swallow errors like the Flutter app does.
  }
}

async function signInHandlerSilent() {
  try {
    const data = await rawPost(ENDPOINTS.login, TXN.login, {
      username: Session.getUsername(),
      password: Session.getPassword(),
    }, {});
    if (data && data.token) {
      Session.setToken(data.token);
      const expiry = data.expiry ? new Date(data.expiry).getTime() : Date.now();
      Session.setTokenExpiryTime(expiry);
      if (data.username) Session.setUsername(data.username);
    }
  } catch (e) { /* swallow, matches signIn_handler.dart */ }
}

/**
 * Primary entry point for every API call in the app.
 * @param {string} apiEndpoint - one of ENDPOINTS.*
 * @param {string} txnId - one of TXN.*
 * @param {object} mandParams
 * @param {object} [addParams]
 */
export async function callApi(apiEndpoint, txnId, mandParams, addParams = {}) {
  const isSignIn = txnId === TXN.login;
  const diff = await timeDifferenceInMinutes();
  const startedAt = performance.now();
  const requestPromise = rawPost(apiEndpoint, txnId, mandParams, addParams).then(
    (data) => { recordApiCall({ txnId, ok: true, ms: Math.round(performance.now() - startedAt) }); return data; },
    (err) => { recordApiCall({ txnId, ok: false, ms: Math.round(performance.now() - startedAt) }); throw err; },
  );

  if (!isSignIn && diff <= 0) {
    await signInHandlerSilent();
    return requestPromise;
  }
  if (!isSignIn && diff <= 5) {
    handleRefreshToken();
    return requestPromise;
  }
  return requestPromise;
}

export { ENDPOINTS, TXN };
