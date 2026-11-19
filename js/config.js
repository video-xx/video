/* Aevy backend settings.
   The publishable key is designed to be public: it ships in the browser.
   What protects the data is Row Level Security (supabase/schema.sql), not this key.
   NEVER put a "secret" or "service_role" key in this file. */
window.AEVY_CONFIG = {
  url: 'https://coybflaniggrhdltbxtg.supabase.co',
  key: 'sb_publishable_P3I9P8LzWPhZ0oe84jTuJQ_YB_lDLLz',
  autoGuest: true,  /* every new visitor silently gets a guest account that follows the owner and likes the owner's posts. Set false to turn off */
  creatorPosts: 3,  /* public posts needed to earn the Creator badge; keep equal to aevy_verify_scripts() in schema.sql */
  newDays: 7,  /* how long the "New" badge shows; keep equal to aevy_new_user_days() in schema.sql */
  contactEmail: '',  /* shown on the Contact page, e.g. 'support@yourdomain.com' */
  adminNames: ['Aevy'],  /* display names reserved for the owner: the earliest account with this name shows the Admin badge */
  suggestStrip: false,  /* the "Suggested accounts" row on Home: hidden. Set true to show it again */
  suggest: true,  /* "Follow Aevy" prompt + "Suggested accounts" strip on Home (real accounts only) */
  adminUsernames: ['aevy']  /* these accounts always show the red Admin badge (never the New badge). Also run the SQL in README to give them real Admin rights */
};
