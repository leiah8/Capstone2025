import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const { candidate_id, project_id, owner_id } = await req.json();

    if (!candidate_id || !project_id || !owner_id) {
      return respond({ error: "candidate_id, project_id, and owner_id are required." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Confirm the owner liked the candidate for this project
    const { data: candidateLike, error: clError } = await supabase
      .from("candidate_likes")
      .select("id")
      .eq("owner_id", owner_id)
      .eq("project_id", project_id)
      .eq("candidate_id", candidate_id)
      .eq("reaction", "like")
      .maybeSingle();

    if (clError) throw new Error(`candidate_likes query failed: ${clError.message}`);

    // 2. Confirm the candidate liked the project
    const { data: projectLike, error: plError } = await supabase
      .from("project_likes")
      .select("id")
      .eq("user_id", candidate_id)
      .eq("project_id", project_id)
      .eq("reaction", "like")
      .maybeSingle();

    if (plError) throw new Error(`project_likes query failed: ${plError.message}`);

    // No mutual like — not a match
    if (!candidateLike || !projectLike) {
      return respond({ match: false, message: "No mutual like — no match created." });
    }

    // 3. Upsert the match (safe to call multiple times)
    let { data: match, error: upsertError } = await supabase
      .from("matches")
      .upsert(
        { project_id, owner_id, candidate_id },
        { onConflict: "project_id,candidate_id", ignoreDuplicates: true }
      )
      .select()
      .maybeSingle();

    if (upsertError) throw new Error(`matches upsert failed: ${upsertError.message}`);

    // ignoreDuplicates returns null when the row already existed — fetch it
    if (!match) {
      const { data: existing, error: fetchError } = await supabase
        .from("matches")
        .select()
        .eq("project_id", project_id)
        .eq("candidate_id", candidate_id)
        .single();
      if (fetchError) throw new Error(`matches fetch failed: ${fetchError.message}`);
      match = existing;
    }

    // 4. Create a conversation for this match if one doesn't exist yet
    //    Find an existing conversation shared between owner and candidate.
    const { data: ownerConvs } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", owner_id);
    const ownerConvIds = (ownerConvs ?? []).map((r: any) => r.conversation_id);

    let existingConvId: string | null = null;
    if (ownerConvIds.length > 0) {
      const { data: shared } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", candidate_id)
        .in("conversation_id", ownerConvIds)
        .limit(1)
        .maybeSingle();
      existingConvId = shared?.conversation_id ?? null;
    }

    if (!existingConvId) {
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({ project_id, owner_id })
        .select()
        .single();

      if (convError) throw new Error(`conversation insert failed: ${convError.message}`);

      const { error: participantsError } = await supabase
        .from("conversation_participants")
        .insert([
          { conversation_id: newConv.id, user_id: owner_id, role: "owner" },
          { conversation_id: newConv.id, user_id: candidate_id, role: "member" },
        ]);

      if (participantsError) throw new Error(`participants insert failed: ${participantsError.message}`);
    }

    return respond({
      match: true,
      message: match ? "New match created!" : "Match already existed.",
      data: match ?? { project_id, owner_id, candidate_id },
    });

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function respond(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}