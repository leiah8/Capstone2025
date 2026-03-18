import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const DEFAULT_RESUME_PARSER_API_BASE_URL =
  "https://resume-parser-production-000c.up.railway.app";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

const upstreamBaseUrl = (
  Deno.env.get("RESUME_PARSER_API_BASE_URL") ??
  DEFAULT_RESUME_PARSER_API_BASE_URL
).replace(/\/$/, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!upstreamBaseUrl) {
    return jsonResponse(
      { error: "Server misconfigured: RESUME_PARSER_API_BASE_URL is not set." },
      500,
    );
  }

  const incomingUrl = new URL(req.url);
  const normalizedPath = incomingUrl.pathname.replace(/\/+$/, "");

  let routePath = "";
  if (normalizedPath.endsWith("/parse/upload")) {
    routePath = "/parse/upload";
  } else if (normalizedPath.endsWith("/parse/url")) {
    routePath = "/parse/url";
  } else if (normalizedPath.endsWith("/health")) {
    routePath = "/health";
  }

  if (!routePath) {
    return jsonResponse(
      { error: "Unsupported route. Use /parse/upload or /parse/url." },
      404,
    );
  }

  if (routePath !== "/health") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(
        { error: "Server misconfigured: Supabase credentials not set." },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.slice("Bearer ".length);
    const { error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }
  }

  try {
    const upstreamUrl = `${upstreamBaseUrl}${routePath}`;
    const headers = new Headers();

    const contentType = req.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    const accept = req.headers.get("accept");
    if (accept) {
      headers.set("accept", accept);
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.arrayBuffer();
    }

    const upstreamResp = await fetch(upstreamUrl, init);
    const responseBody = await upstreamResp.arrayBuffer();

    return new Response(responseBody, {
      status: upstreamResp.status,
      headers: {
        "Content-Type": upstreamResp.headers.get("content-type") ?? "application/json",
        ...corsHeaders,
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to reach resume parser API upstream.",
        detail: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
});
