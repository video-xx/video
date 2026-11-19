-- Run in Supabase > SQL Editor AFTER schema.sql.

-- Give the blue badge to every user that exists right now:
update public.profiles set verified = true;

-- Later, for one person only (change the username):
-- update public.profiles set verified = true where username = 'someone';
-- Remove a badge:
-- update public.profiles set verified = false where username = 'someone';
