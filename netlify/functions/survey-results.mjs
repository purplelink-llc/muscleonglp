/**
 * Netlify Function — aggregate the GLP-1 muscle survey (MuscleOnGLP).
 *
 * GET /.netlify/functions/survey-results?token=...
 *   -> { n, since, until, results: { field: { option: count } }, crosstabs }
 *
 * Gated by SURVEY_TOKEN, set on the Netlify site. Without a matching token this
 * 401s, because unpublished response counts should not be public while the
 * sample is still small enough to misread.
 *
 * Returns counts only. Individual records are never exposed, and the daily
 * visitor hash is not returned at all.
 *
 * Two crosstabs are included because they are the likely story: whether people
 * who resistance train also hit a protein target, and whether a clinician ever
 * raising muscle loss tracks with actually doing anything about it.
 */

import { getStore } from "@netlify/blobs";

const FIELDS = ["med", "duration", "training", "tracks", "grams", "clinician", "stopping", "strength"];

function json(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(request) {
  const expected = Netlify.env.get("SURVEY_TOKEN");
  if (!expected) {
    return json(500, { error: "misconfigured", detail: "Set SURVEY_TOKEN on this site." });
  }
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token !== expected) return json(401, { error: "unauthorized" });

  const store = getStore("survey");
  let entries = [];
  try {
    const listed = await store.list({ prefix: "resp/" });
    entries = listed.blobs || [];
  } catch (_) {
    return json(500, { error: "list_failed" });
  }

  const results = Object.fromEntries(FIELDS.map((f) => [f, {}]));
  const crosstabs = {
    trains_and_hits_protein: {},   // training -> tracks
    clinician_vs_training: {},     // clinician -> training
  };
  let n = 0;
  let since = null;
  let until = null;

  for (const blob of entries) {
    let rec;
    try {
      rec = await store.get(blob.key, { type: "json" });
    } catch (_) {
      continue;
    }
    if (!rec) continue;
    n += 1;
    if (rec.day) {
      if (!since || rec.day < since) since = rec.day;
      if (!until || rec.day > until) until = rec.day;
    }
    for (const f of FIELDS) {
      const v = rec[f];
      if (!v) continue;
      results[f][v] = (results[f][v] || 0) + 1;
    }
    if (rec.training && rec.tracks) {
      const k = rec.training;
      crosstabs.trains_and_hits_protein[k] = crosstabs.trains_and_hits_protein[k] || {};
      crosstabs.trains_and_hits_protein[k][rec.tracks] =
        (crosstabs.trains_and_hits_protein[k][rec.tracks] || 0) + 1;
    }
    if (rec.clinician && rec.training) {
      const k = rec.clinician;
      crosstabs.clinician_vs_training[k] = crosstabs.clinician_vs_training[k] || {};
      crosstabs.clinician_vs_training[k][rec.training] =
        (crosstabs.clinician_vs_training[k][rec.training] || 0) + 1;
    }
  }

  return json(200, {
    n,
    since,
    until,
    note:
      "Counts only. Self-selected, self-reported sample. Do not publish until n is " +
      "large enough to describe honestly, and always publish the limitations with it.",
    results,
    crosstabs,
  });
}
