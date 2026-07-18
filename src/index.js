/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const ACCESS_EMAIL_HEADER = 'cf-access-authenticated-user-email';
const DEFAULT_FLAG_CONTENT_TYPE = 'image/png';
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// Accepts both the edge-trusted request.cf.country and the untrusted /secure/:country URL segment.
// Returns an uppercased 2-letter code, or null for anything else (missing, wrong length, or
// Cloudflare's non-alpha codes like the Tor exit-node marker "T1").
function normalizeCountryCode(raw) {
	if (typeof raw !== 'string' || !/^[a-zA-Z]{2}$/.test(raw)) {
		return null;
	}
	return raw.toUpperCase();
}

function resolveImageContentType(object) {
	return object.httpMetadata?.contentType || DEFAULT_FLAG_CONTENT_TYPE;
}

function handleSecure(request) {
	const email = request.headers.get(ACCESS_EMAIL_HEADER);
	if (!email) {
		return new Response('Missing authenticated identity - this route must be accessed via Cloudflare Access.', {
			status: 401,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
	}

	const timestamp = new Date().toISOString();
	const country = normalizeCountryCode(request.cf?.country);
	const countryHtml = country ? `<a href="/secure/${escapeHtml(country)}">${escapeHtml(country)}</a>` : escapeHtml('unknown');

	const body = `${escapeHtml(email)} authenticated at ${escapeHtml(timestamp)} from ${countryHtml}`;
	return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function handleSecureCountry(env, rawCountry) {
	const country = normalizeCountryCode(rawCountry);
	if (!country) {
		return new Response('Invalid country code - expected exactly 2 letters, e.g. "US".', {
			status: 400,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
	}

	const object = await env.FLAGS_BUCKET.get(country);
	if (!object) {
		return new Response('No flag found for this country code.', {
			status: 404,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
	}

	return new Response(object.body, {
		headers: { 'content-type': resolveImageContentType(object) },
	});
}

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);

		if (pathname === '/') {
			return new Response('Hello World!');
		}

		if (pathname === '/secure') {
			return handleSecure(request);
		}

		const countryMatch = pathname.match(/^\/secure\/([^/]+)$/);
		if (countryMatch) {
			return handleSecureCountry(env, countryMatch[1]);
		}

		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	},
};
