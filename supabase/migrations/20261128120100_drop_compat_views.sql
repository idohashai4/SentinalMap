-- Run once both sites use their own schema: remove the temporary public views and wrapper.
drop view if exists public.points_of_interest, public.poi_topics, public.place_labels, public.map_shapes, public.layer_notes;
drop view if exists public.reado_books, public.reado_reading_state, public.reado_highlights, public.reado_bookmarks, public.reado_sessions, public.reado_secret;
drop function if exists public.is_allowed();
notify pgrst, 'reload schema';
