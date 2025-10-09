--------------------------------------------------------------------
-- 1. ENABLE RLS
--------------------------------------------------------------------

ALTER TABLE public.profiles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_likes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants   ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------
-- 2. PROFILES
--------------------------------------------------------------------
CREATE POLICY profiles_select_self
ON public.profiles
FOR SELECT
USING (id = auth.uid());

CREATE POLICY profiles_update_self
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_insert_self
ON public.profiles
FOR INSERT
WITH CHECK (id = auth.uid());

--------------------------------------------------------------------
-- 3. PROJECTS
--------------------------------------------------------------------
CREATE POLICY projects_public_read
ON public.projects
FOR SELECT
USING (is_active = true);

CREATE POLICY projects_owner_insert
ON public.projects
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY projects_owner_update
ON public.projects
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

--------------------------------------------------------------------
-- 4. PROJECT_LIKES  (candidate → project)
--------------------------------------------------------------------
CREATE POLICY project_likes_insert_self
ON public.project_likes
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY project_likes_select_self
ON public.project_likes
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY project_likes_select_owner
ON public.project_likes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_likes.project_id
      AND p.owner_id = auth.uid()
  )
);

CREATE POLICY project_likes_delete_self
ON public.project_likes
FOR DELETE
USING (user_id = auth.uid());

--------------------------------------------------------------------
-- 5. CANDIDATE_LIKES  (project owner → candidate)
--------------------------------------------------------------------
CREATE POLICY candidate_likes_insert_owner
ON public.candidate_likes
FOR INSERT
WITH CHECK (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = candidate_likes.project_id
      AND p.owner_id = auth.uid()
  )
);

CREATE POLICY candidate_likes_select_owner
ON public.candidate_likes
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY candidate_likes_select_candidate
ON public.candidate_likes
FOR SELECT
USING (candidate_id = auth.uid());

CREATE POLICY candidate_likes_delete_owner
ON public.candidate_likes
FOR DELETE
USING (owner_id = auth.uid());

--------------------------------------------------------------------
-- 6. MATCHES
--------------------------------------------------------------------
CREATE POLICY matches_select_participants
ON public.matches
FOR SELECT
USING (
  owner_id = auth.uid() OR candidate_id = auth.uid()
);

--------------------------------------------------------------------
-- 7. CONVERSATIONS
--------------------------------------------------------------------
CREATE POLICY conversations_select_participants
ON public.conversations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
  )
  OR owner_id = auth.uid()
);

CREATE POLICY conversations_insert_owner
ON public.conversations
FOR INSERT
WITH CHECK (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = conversations.project_id
      AND p.owner_id = auth.uid()
  )
);

CREATE POLICY conversations_update_owner
ON public.conversations
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

--------------------------------------------------------------------
-- 8. CONVERSATION_PARTICIPANTS
--------------------------------------------------------------------
CREATE POLICY conv_participants_select_member
ON public.conversation_participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id
      AND cp2.user_id = auth.uid()
  )
);

CREATE POLICY conv_participants_insert_owner
ON public.conversation_participants
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY conv_participants_delete_owner
ON public.conversation_participants
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND c.owner_id = auth.uid()
  )
);

--------------------------------------------------------------------
-- 9. MESSAGES
--------------------------------------------------------------------
CREATE POLICY messages_select_participants
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY messages_insert_participants
ON public.messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);

COMMIT;
