CREATE TABLE public.messages (
  id               bigserial PRIMARY KEY,
  conversation_id  bigint NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id        uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body             text   NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conv_time_idx ON public.messages (conversation_id, created_at);
