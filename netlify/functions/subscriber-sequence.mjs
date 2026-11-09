/**
 * Netlify Scheduled Function — new-subscriber "Complete Pack" sequence.
 *
 * Runs daily. For each of three stages (day 3 / day 7 / day 12 after
 * signup), asks Buttondown directly for subscribers who have crossed that
 * threshold and haven't been sent that stage yet, sends them the
 * already-created draft email for that stage via Buttondown's per-subscriber
 * send endpoint, and tags them so they are never sent it twice.
 *
 * No Buttondown Automations add-on ($29/mo) involved — see
 * docs/superpowers/specs/2026-09-18-muscleonglp-subscriber-lifecycle-design.md
 * for why this is a Netlify Scheduled Function driving Buttondown's plain
 * send API instead. `BUTTONDOWN_API_KEY` is already set on this site (the
 * same key subscribe.mjs uses).
 *
 * The three EMAIL_ID values below are drafts created once via the API
 * (POST /v1/emails, status: "draft") and never sent directly — only ever
 * reached through the per-subscriber send call below. If the copy ever
 * needs to change, edit the draft in the Buttondown dashboard directly;
 * this function only decides *who* and *when*, never *what*.
 */

const BUTTONDOWN_API = "https://api.buttondown.email/v1";

const STAGES = [
  { days: 3, emailId: "em_582t80wdqc811bm6ce4qe4g2ag", sentTag: "seq3-sent", label: "day 3" },
  { days: 7, emailId: "em_6amcprdds58mxvn6c9zzpqdwyv", sentTag: "seq7-sent", label: "day 7" },
  { days: 12, emailId: "em_6y30mqffb99rjanng6kgkh2593", sentTag: "seq12-sent", label: "day 12" },
];

function daysAgoDateOnly(days) {
  // date__end on GET /subscribers takes a plain YYYY-MM-DD (format: "date"),
  // not a full timestamp -- confirmed against Buttondown's own OpenAPI schema.
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** GET /subscribers' `-tag` filter needs the tag's ID, not its name (confirmed
 *  live: passing a name 400s with "Tag must be a valid UUID", even though the
 *  docs' own example reads like a plain name). Listing tags is free; only the
 *  dedicated tag-management endpoint (POST /tags) is gated behind a paid plan,
 *  which is why this resolves against tags Buttondown already auto-created
 *  from a subscriber PATCH (see sendAndTag) rather than creating them via that
 *  endpoint. Returns a name -> id map; a name with no matching tag yet (true
 *  on this function's very first-ever run for a given stage) is simply
 *  absent, which callers treat as "nobody could have this tag yet". */
async function tagIdsByName(key) {
  const map = {};
  let url = `${BUTTONDOWN_API}/tags`;
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Token ${key}` } });
    if (!resp.ok) {
      console.error("subscriber-sequence: tag list failed", resp.status, await resp.text().catch(() => ""));
      break;
    }
    const data = await resp.json();
    for (const tag of data.results || []) map[tag.name] = tag.id;
    url = data.next || null;
  }
  return map;
}

/** Everyone eligible for this stage: real, confirmed subscribers (type=regular
 *  excludes not just unsubscribed/blocked/churned but also, critically,
 *  "unactivated" -- Buttondown's default double-opt-in state for every
 *  subscriber this account has ever added via the API, confirmed live on
 *  2026-09-18: 100% of the current list, including the one real paying
 *  customer, is stuck unactivated. Sending to them would be wrong regardless
 *  -- an unconfirmed address hasn't agreed to receive anything yet -- so this
 *  filter is correct as-is; the real problem it surfaces belongs to signup
 *  flow, not this function. See the subscriber-lifecycle spec.) who signed up
 *  on or before the cutoff date and have not already been tagged as sent this
 *  stage. Using "on or before" rather than "exactly N days ago" means a day
 *  the function fails to run does not permanently skip anyone -- the next
 *  successful run still finds them, still eligible. Paginates via
 *  Buttondown's `next` cursor. */
async function eligibleSubscribers({ days, sentTag }, tagIds, key) {
  const subs = [];
  const tagId = tagIds[sentTag];
  let url =
    `${BUTTONDOWN_API}/subscribers?type=regular` +
    `&date__end=${encodeURIComponent(daysAgoDateOnly(days))}` +
    (tagId ? `&-tag=${encodeURIComponent(tagId)}` : "");
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Token ${key}` } });
    if (!resp.ok) {
      console.error("subscriber-sequence: list failed", resp.status, await resp.text().catch(() => ""));
      break;
    }
    const data = await resp.json();
    subs.push(...(data.results || []));
    url = data.next || null;
  }
  return subs;
}

/** Send this stage's email to one subscriber, then tag them so no future run
 *  ever sends it again. A 409 means Buttondown itself already considers this
 *  email sent to this person (e.g. a prior run tagged them but the process
 *  died before the tag write completed) -- treated as success, not a retry
 *  target, since re-sending would be the actual bug here. */
async function sendAndTag(subscriber, stage, key) {
  const idOrEmail = encodeURIComponent(subscriber.email_address);
  const sendResp = await fetch(
    `${BUTTONDOWN_API}/subscribers/${idOrEmail}/emails/${stage.emailId}`,
    { method: "POST", headers: { Authorization: `Token ${key}` } },
  );
  if (!sendResp.ok && sendResp.status !== 409) {
    console.error(
      "subscriber-sequence: send failed",
      stage.label, subscriber.email_address, sendResp.status,
      await sendResp.text().catch(() => ""),
    );
    return false; // do not tag -- let the next run try again
  }

  const tags = Array.from(new Set([...(subscriber.tags || []), stage.sentTag]));
  const tagResp = await fetch(`${BUTTONDOWN_API}/subscribers/${idOrEmail}`, {
    method: "PATCH",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
  if (!tagResp.ok) {
    // The send already happened (or Buttondown says it already had). Not
    // tagging risks a resend tomorrow, so this is worth a loud log even
    // though the function keeps going -- there is no user-facing response
    // to report it through.
    console.error(
      "subscriber-sequence: tag failed after send", stage.label,
      subscriber.email_address, tagResp.status, await tagResp.text().catch(() => ""),
    );
    return false;
  }
  return true;
}

export default async (req) => {
  const key = Netlify.env.get("BUTTONDOWN_API_KEY");
  if (!key) {
    console.error("subscriber-sequence: BUTTONDOWN_API_KEY not set");
    return;
  }

  let tagIds;
  try {
    tagIds = await tagIdsByName(key);
  } catch (err) {
    console.error("subscriber-sequence: tag lookup failed", String(err));
    return; // without tag IDs, -tag filtering can't be trusted; safer to skip the whole run
  }

  for (const stage of STAGES) {
    let subs;
    try {
      subs = await eligibleSubscribers(stage, tagIds, key);
    } catch (err) {
      console.error("subscriber-sequence: eligibility check failed", stage.label, String(err));
      continue; // one stage's outage should not block the others
    }
    if (subs.length === 0) continue;

    let sent = 0;
    for (const sub of subs) {
      try {
        if (await sendAndTag(sub, stage, key)) sent++;
      } catch (err) {
        console.error("subscriber-sequence: send/tag threw", stage.label, sub.email_address, String(err));
      }
    }
    console.log(`subscriber-sequence: ${stage.label} - ${sent}/${subs.length} sent`);
  }
};

export const config = { schedule: "@daily" };
