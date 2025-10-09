CREATE TABLE public.conversations (
  id           bigserial PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id     uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)  -- one chat room per project
);

CREATE INDEX conversations_owner_idx   ON public.conversations(owner_id);
CREATE INDEX conversations_project_idx ON public.conversations(project_id);
