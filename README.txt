Aevy - video community (Supabase backend)
=========================================

The main experience is a video discovery feed with creator details, latest / trending /
following filters, a video player, and a creator studio for sharing video links. Supported
links include YouTube, Vimeo, and direct MP4 / WebM / OGV / MOV / M4V URLs. The site embeds
videos from their existing hosts; it does not upload or transcode video files.

Video posts use the existing public `scripts` records to keep this version compatible with
the current Supabase setup. A small metadata file is stored with each post, and the video URL
is stored in the record's `video` field. Existing accounts and settings remain in place.

Project: https://coybflaniggrhdltbxtg.supabase.co  (settings are in js/config.js)

Setup (about 5 minutes, one time)
---------------------------------
1. Supabase dashboard -> SQL Editor -> New query -> paste the whole of supabase/schema.sql -> Run.
   This creates the tables, the Row Level Security policies, the profile trigger, the
   delete-account function, the download/view/visitor counters, likes, reviews and the Realtime
   setup. It is safe to run again (run it again now if you already had an older version).
   Without it every request fails.
2. Authentication -> Sign In / Providers -> Email: enabled.
   Recommended: turn OFF "Confirm email" so new accounts can sign in at once.
   (With it ON everything still works: the user must click the emailed link before signing in.)
3. Authentication -> URL Configuration:
     Site URL        = the address where you host the site (e.g. https://yourname.github.io/aevy/)
     Redirect URLs   = add the same address, plus http://localhost:8080/ for local testing.
   Password-reset links return to these addresses.
5. Serve the folder over http(s) - do not open index.html with file://.
   Examples:  npx serve .    or    python3 -m http.server 8080
   Any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages ...).

The publishable key in js/config.js is meant to be public. Data is protected by Row Level
Security (supabase/schema.sql), not by hiding the key. Never put a secret / service_role key in the site.

What lives where
----------------
Accounts        Supabase Auth (auth.users: email + password, hashed by Supabase)
Profiles        table public.profiles      (public: username, name, bio, location, website, photo + cover address; username is unique)
Profile photos  Storage bucket "avatars" (public read; each user can write only inside their own folder <user id>/)
Scripts         table public.scripts       (title, language, category, visibility, preview...)
Script files    table public.script_files  (the file content, max 2 MB per script; any file type)
Saved videos    table public.videos        (private to each user)
Community       tables public.script_likes, public.script_comments (likes, reviews), public.daily_stats (visitors/views/downloads per day)
Browser         only the colour theme stays in localStorage; Supabase keeps the login session.

Ownership and privacy (enforced by Row Level Security, not just the UI)
-----------------------------------------------------------------------
- Public scripts: anyone can read and download. Private: only the owner.
- Only the owner can create, edit, replace the file of, or delete a script.
- Owner and created date cannot be changed; usernames are permanent and unique.
- Saved videos are readable only by their owner.
- Deleting an account removes the profile, scripts, files and videos (database cascade).

Moving old data
---------------
If the browser still holds scripts from the old local version, the Profile page shows an
"Upload to your account" button. Data from the previous Firebase project is NOT migrated
automatically (different database); download your scripts from the old site first if you need them.

Profiles (new)
--------------
Each user has a profile page like Facebook / Instagram: cover photo, round profile photo, name, @username, bio,
location, website, join date and counts (scripts, downloads, likes, average rating), with their scripts below.
- Your own page is #/profile (click your photo or name at the top right): change the profile photo with the camera
  button, add or remove a cover photo, and edit name, bio, location and website.
- Everyone's page is #/u/<username> (click an author name on a script).
- Photos are resized in the browser (profile 400x400, cover 1500x500, JPEG) before upload, so they stay small.
- Needs the latest supabase/schema.sql (new profile columns + the "avatars" Storage bucket and its policies).
- The Publishers list page and the AI assistant were removed.

Live statistics, likes and reviews (new)
----------------------------------------
Everything below updates in every open browser instantly (Supabase Realtime), no refresh.
- Download counter     every script card and script page shows downloads, views, likes and the star average.
                       Every download counts (a .zip counts each script inside it).
- Views                counted once per visitor, per script, per day (a page refresh is not a new view).
- "Live today" bar     Visitors today, script views today, downloads today, downloads all time. Shown on Home and
                       Scripts. A visitor is a random anonymous id kept in the browser, counted once per day.
- Likes                signed-in users like / unlike on the script page. One like per user per script.
- Reviews & comments   signed-in users can post a comment and optionally a 1-5 star review (one review per user per
                       script, not on your own script). The author or the script's publisher can delete a comment.
- Community page       #/community: live activity feed (new scripts, reviews, comments, likes), most downloaded and
                       top rated lists, and a "Post a script" button.
- Sorting              Scripts page can sort by Most downloaded / Most viewed / Most liked / Top rated.
Security: the counters cannot be forged from the browser. Only the SQL functions in schema.sql change them
(an owner editing their own script cannot reset or raise them). Private scripts are never counted publicly or
shown in the community feed.
"Today" uses the Asia/Dhaka time zone. To change it, edit the aevy_today() function near the end of schema.sql.
If Realtime does not update: Supabase dashboard -> Database -> Replication / Publications -> supabase_realtime
and make sure scripts, script_comments, script_likes and daily_stats are enabled (schema.sql does this for you).

Badges and ranks (new)
----------------------
- Blue Verified check   a user who has published 3 or more PUBLIC scripts (the Creator badge; only Creators appear in the Home feed) gets it automatically (database triggers,
                        so it cannot be faked from the browser). It is removed again if they drop below 2.
- Admin rank            red "Admin" badge (Admins are always verified). Only you can grant it, in the Supabase SQL editor:
                            update public.profiles set role = 'admin' where username = 'your_username';
                        Admins can delete any public script or comment (moderation). They cannot edit other people's
                        scripts and cannot read private scripts.
- Aevy account          js/config.js has adminUsernames: ['aevy']; that account always shows the red Admin badge (never New).
                        To also give it real moderation rights run:  update public.profiles set role = 'admin' where username = 'aevy';
- New badge             green "New" badge on accounts younger than 7 days. Older accounts show no badge.
- Shown next to the name on script cards, profile pages, comments, the activity feed and the top-right user chip.
- Settings (schema.sql): aevy_verify_scripts() = 3 posts, aevy_new_user_days() = 7 days. If you change the days,
  also change newDays in js/config.js so the site and the database agree.
- Run the new supabase/schema.sql again: it adds profiles.role + profiles.verified, the triggers, the profile_badges
  view, the admin policies, and back-fills existing users.

Social: follow, messages, online status (new)
---------------------------------------------
- Follow / Following   on every profile (#/u/<username>): Follow button, live Followers / Following counts, click a count
                       to see the list. You cannot follow yourself.
- Messages             #/messages (also the "Messages" link in the top bar, with an unread counter). Press Message on a
                       profile or search a name in the left panel. Messages arrive instantly (Realtime), show "Seen",
                       and you can Unsend your own. Only the sender and the recipient can read a message (Row Level
                       Security). Limit: 2000 characters, 30 messages per minute. The newest 500 messages load at
                       once; opening a chat loads up to 200 more of that conversation.
- Online / offline     the open site sends a heartbeat every 45 s. Online = seen in the last 2.5 min; otherwise
                       "Last seen ...". Shown as a green ring on the profile photo and a line under the username,
                       and in the chat header. Users can switch it off with "Show my online status" in Messages;
                       hidden users show neither online nor last seen.
- Setup                run the latest supabase/schema.sql again (adds follows, messages, presence, mark_read(),
                       touch_presence(), get_presence() and Realtime for messages + follows).
- Not included yet     blocking users, group chats, image/file messages, push notifications.

Home page (new: social feed)
----------------------------
The marketing hero, feature grid and animated demo were removed. Home (js/home.js) is now a 3-column social layout:
- Left     your card (photo, name, badges, scripts / followers / following) and shortcuts; a sign-in card when signed out.
- Centre   "Share a script" box, then the feed with tabs: Latest, Trending (likes, downloads, views of recent scripts)
           and Following (only people you follow). Each post has Like, Review, Copy and Download.
- Right    Live today counters, Who to follow (with Follow buttons) and Online now.
On phones it becomes one column. No database change is needed for the home page.
(The old home styles are still in css/style.css but unused; they are safe to delete.)

Community (new: social feed, #/community)
------------------------------------------
- Post box: write an update, question or tip (up to 1000 characters) and optionally attach one of your public scripts.
  Use @username to mention someone (becomes a link to their profile).
- Feed tabs: All, Following (people you follow), Discussions (text posts only), Scripts (new scripts only).
  New scripts are mixed into the feed automatically, with the normal Like / Review / Copy / Download buttons.
- Like and comment on posts. Comments open under the post. The commenter, the post's author and Admins can delete a
  comment; the author and Admins can delete a post. Limits: 10 posts and 20 comments per minute per user.
- Live: new posts, like counts and comments appear without a refresh (Supabase Realtime).
- Side column: Who to follow, Online now, Most downloaded.
- Setup: run the latest supabase/schema.sql again (adds posts, post_likes, post_comments, their policies and triggers).
  Until then the page shows a "not set up yet" message. The old live-activity list was replaced by this feed.

Profile (new design: #/profile and #/u/<username>)
--------------------------------------------------
- Header card: cover, large photo, name with badges, @username, online status, Follow / Message (or Edit profile) and
  Share (copies the profile link). Stat tiles: scripts, downloads, likes, rating, followers, following.
- Tabs: Scripts (search, Publish button), Posts (that member's Community posts, with like and comment),
  About, and Settings (own profile only).
- Edit profile opens a small dialog (name, bio, location, website, change photo / cover): no long forms on the page.
- Side card: bio, location, website, join date, Verified / Admin note. Your own page also shows a
  "Complete your profile" checklist with one-click add buttons.
- Settings (own): online-status switch, change password, delete account.
- No database change is needed for the profile design.

Look and feel
-------------
css/style.css  the whole interface; the colour and spacing tokens are at the top of the file (dark and light sets)
To add your own artwork (e.g. anime illustrations), put the image in assets/ and use it in index.html.

Any file type
-------------
Scripts can be any file: plain text, obfuscated or encrypted scripts, and binary files. Text is stored
as is. Anything that is not valid UTF-8 text (encrypted / binary) is stored losslessly as base64 and
decoded again on download, so the downloaded file is byte-for-byte the original, with its original
extension. Encrypted files are shown as "Binary or encrypted file" instead of text and cannot be
copied as text; use Download. Limit: 2 MB per file.
If you ran an older schema.sql, run the new one again (it adds the "ext" column and the larger limit).

Notes
-----
- Sign in uses email + password; the username is the public handle.
- Password reset: "Forgot password?" emails a reset link; the site then asks for a new password.
- Libraries load up to 1000 public scripts / profiles. Add pagination if you grow past that.
- supabase-js 2.117.3 is loaded from cdn.jsdelivr.net, so the site needs internet.


Messaging (rebuilt)
-------------------
- Message icon in the header with a live unread count. Click it for a popup inbox: search people, All / Unread tabs,
  newest conversations first.
- Choosing a conversation opens a pop-up chat window at the bottom right (up to 3 side by side, minimise / close /
  open in full page). On phones it opens the full Messages page instead.
- Messages page: conversation list on the left, chat on the right. Day separators, grouped bubbles, clickable links,
  Delivered / Seen receipts that update live, typing indicator, Unsend, failed-send Retry, and an online-status switch.
- New messages show a notification card (click to reply) and the browser tab title shows (n) unread.
- The profile "Message" button opens the pop-up chat. No database change is needed; the existing schema.sql is enough.


Saved + Pinned scripts, profile extras (new)
--------------------------------------------
- Save        every script card has a Save button (private bookmark). Your own profile has a "Saved" tab. Guests are sent to sign in.
- Pin         on your own profile each script card has Pin / Unpin; up to 3 pinned scripts show first with a "Pinned" tag (enforced in the database).
- Profile     Instagram-style header, grid/list toggle, "Follows you" tag, native Share on phones.
- Chat        Instagram-style bubbles, emoji picker, phone-safe full-screen layout.
- Home        scripts and posts only. Signed-out visitors also see the "Follow Aevy" prompt and "Suggested accounts" strip (js/suggest.js, switch off with suggest:false in js/config.js).
Run the new supabase/schema.sql again: it adds script_saves and script_pins with Row Level Security (safe to re-run).

Reports
- Signed-in users see a Report button on other people's scripts and profiles. Re-run supabase/schema.sql once to create the
  reports table. Read reports in Supabase > Table Editor > reports (set status to reviewed/dismissed when done).
- The blue Verified badge already exists: it is given automatically after 3 public scripts (Admins are always verified).

Aevy AI chat (Gemini)
---------------------
The Gemini key must NEVER go into the website files. It lives in a Supabase Edge Function:
  1. Create a NEW key in Google AI Studio (revoke any key you pasted anywhere public).
  2. npm i -g supabase   then   supabase login   and   supabase link --project-ref coybflaniggrhdltbxtg
  3. supabase secrets set GEMINI_API_KEY=YOUR_NEW_KEY
  4. supabase functions deploy ai-chat
Optional: supabase secrets set GEMINI_MODEL=gemini-flash-latest   (default)
Only signed-in users can call it (Supabase checks the login token).

Guest accounts ("no account, no entry")
---------------------------------------
Visitors without an account are sent to the sign-in page and can tap "Continue as guest". A guest gets an
automatic username (like calm_fox_482), name and a generated profile picture, and can ONLY message other guests.
Likes, comments, follows, posts, scripts and the AI chat are blocked in the site and in the database.
Setup: 1) run the latest supabase/schema.sql   2) Supabase > Authentication > Sign In / Providers >
turn ON "Allow anonymous sign-ins"   3) paste the updated ai-chat function (it now refuses guests).
Tidy up old guests now and then (SQL editor):  select public.purge_old_guests(30);


v7: Encrypted messages, guest isolation, Community removed
----------------------------------------------------------
1. Run the whole supabase/schema.sql again in the Supabase SQL editor (safe to repeat). The last section adds
   user_keys, key_backups, the "encrypted only" rule for messages, and guest isolation.
2. Messages are end-to-end encrypted in the browser (js/e2e.js, ECDH P-256 + AES-256-GCM). The server stores
   only "e2e1:<ciphertext>". Not even the site owner can read a chat.
3. Each person must open Aevy once after this update so their key is created. Until then, others get the message
   "has not turned on encrypted messages yet" when they try to write to them.
4. On first use a recovery passphrase is offered. It lets the person read chats on another device. It is never sent
   to the server and cannot be reset. If lost, "Reset encryption" creates new keys and old chats stay unreadable.
   Guests keep their key on that device only.
5. Messages sent before this update stay readable (they were plain text). Delete them if you want a clean start.
6. Guests and members cannot see each other: profiles, keys, online status and chats are separated by the database.
7. Limits: the app does not (yet) show safety numbers to verify a contact's key, so it protects against reading by
   the server or the database, but not against a server that actively swaps public keys.


v8: No sign-in gate, automatic guests
-------------------------------------
- Nobody is sent to the sign-in page any more. The first time someone opens the site a guest account is created
  silently (random name + picture). It follows @aevy and likes aevy's posts and public scripts (database function
  guest_welcome(), run on every visit so new posts get liked too).
- The only notice a visitor sees is "Create an account for a better experience", shown once per visit after the first
  scroll (js/guest.js). Tapping like / comment / follow / publish as a guest shows the same notice.
- Needed once: 1) run supabase/schema.sql again (adds guest_welcome)  2) Supabase > Authentication > Sign In / Providers
  > turn ON "Allow anonymous sign-ins"  3) Authentication > Rate limits: anonymous sign-ins are limited per IP per hour.
- Turn it off: set autoGuest: false in js/config.js. The follows/likes/follower counts include these guests.
- Guests are invisible to members, so they do not appear in follower lists, but they are counted.
- Run  select public.purge_old_guests(30);  now and then to delete unused guest accounts.

v9: Instagram-style photos and Activity (mobile first)
-----------------------------------------------------
- "+" in the bottom bar opens Create: Photo post or Script. A photo can be chosen from the gallery or taken with the
  camera, cropped (Square / Portrait / Original), given a filter (9) plus brightness and contrast, captioned and shared.
  It is resized on the phone (max 1080 px JPEG) and stored in the public Storage bucket "posts".
- Home shows the photo feed (double-tap to like, comments, share, delete your own). Every profile has a Photos tab (3-column grid).
- Activity tab (heart in the bottom bar): new followers, likes and comments on your photos and scripts, with a red dot.
- Messages: paper-plane icon at the top right on phones (red dot for unread); the full encrypted DM page is unchanged.
- Needed once: run supabase/schema.sql again (adds posts.image, the "posts" bucket and get_activity()).
- Guests can look, but cannot post, like or comment (create an account prompt).


Aevy Social chat (folder social/)
---------------------------------
A messenger (chats, groups, channels, contacts, stories) that opens at  yoursite/social/  and is linked from the menu.
It uses its OWN Supabase project (the two projects have tables with the same names, so they must stay separate).
Settings : social/config.js        (url + publishable key of the Aevy Social project)
Database : supabase/social-schema.sql  -> run it ONCE in the Aevy Social project's SQL Editor (not in the website's project),
           then supabase/social-give-blue-badge.sql for the blue badge.
Auth     : in the Aevy Social project open Authentication > URL Configuration and add  https://YOURSITE/social/  to Redirect URLs.
Accounts : the website and the chat have separate logins.
