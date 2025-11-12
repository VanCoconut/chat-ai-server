import { POST as register } from "./endpoints/register.js";
import { POST as login } from "./endpoints/login.js";
import { POST as chat } from "./endpoints/chat.js";

// Helper per aggiungere CORS a qualsiasi Response
function withCors(response) {
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type");
	return response;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// Preflight CORS
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 200,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		let response;

		if (url.pathname === "/register" && request.method === "POST") {
			response = await register(request, env);
		} else if (url.pathname === "/login" && request.method === "POST") {
			response = await login(request, env);
		} else if (url.pathname === "/chat" && request.method === "POST") {
			response = await chat(request, env);
		} else {
			response = new Response("Not Found", { status: 404 });
		}

		return withCors(response);
	},
};
