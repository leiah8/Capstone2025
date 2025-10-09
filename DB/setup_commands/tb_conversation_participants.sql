CREATE TABLE public.conversation_participants (
  conversation_id bigint NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            text   NOT NULL DEFAULT 'member',  -- 'owner' | 'member' (free text for MVP)
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conv_participants_user_idx ON public.conversation_participants(user_id);
