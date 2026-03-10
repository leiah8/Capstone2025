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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

const upstreamBaseUrl = (Deno.env.get("MATCHING_API_BASE_URL") ?? "").replace(/\/$/, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!upstreamBaseUrl) {
    return jsonResponse(
      { error: "Server misconfigured: MATCHING_API_BASE_URL is not set." },
      500,
    );
  }

  const incomingUrl = new URL(req.url);
  const normalizedPath = incomingUrl.pathname.replace(/\/+$/, "");

  let routePath = "";
  if (normalizedPath.endsWith("/match/score")) {
    routePath = "/match/score";
  } else if (normalizedPath.endsWith("/match/candidates")) {
    routePath = "/match/candidates";
  } else if (normalizedPath.endsWith("/match/health")) {
    routePath = "/match/health";
  }

  if (!routePath) {
    return jsonResponse(
      { error: "Unsupported route. Use /match/score, /match/candidates, or /match/health." },
      404,
    );
  }

  // Require a valid Supabase JWT for all routes except health
  if (routePath !== "/match/health") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Server misconfigured: Supabase credentials not set." }, 500);
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
        error: "Failed to reach matching API upstream.",
        detail: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
});
