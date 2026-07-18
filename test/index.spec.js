import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

describe("Hello World worker", () => {
	it("responds with Hello World! (unit style)", async () => {
		const request = new Request("http://example.com");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it("responds with Hello World! (integration style)", async () => {
		const response = await SELF.fetch("http://example.com");
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});
});

describe("/secure identity route", () => {
	it("returns 401 when the Access identity header is missing", async () => {
		const request = new Request("http://example.com/secure");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});

	it("renders the authenticated email, timestamp, and a country link", async () => {
		const request = new Request("http://example.com/secure", {
			headers: { "cf-access-authenticated-user-email": "user@example.com" },
			cf: { country: "US" },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.text();
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(body).toContain("user@example.com authenticated at");
		expect(body).toContain('<a href="/secure/US">US</a>');
	});
});

describe("/secure/:country flag route", () => {
	it("returns 400 for an invalid country code", async () => {
		const request = new Request("http://example.com/secure/usa");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
	});

	it("returns 404 when no flag is stored for that country", async () => {
		const request = new Request("http://example.com/secure/zz");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
	});

	it("returns the flag image with its stored content type", async () => {
		await env.FLAGS_BUCKET.put("US", "fake-png-bytes", { httpMetadata: { contentType: "image/png" } });
		const request = new Request("http://example.com/secure/us");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(await response.text()).toBe("fake-png-bytes");
	});
});
