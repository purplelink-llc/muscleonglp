# SEO tests log

Traffic is too low for split tests (about 50 Google impressions a day site-wide; detecting a doubling
of CTR would need ~39,000 impressions per arm). Method instead: time-based tests with a control group.

- Change one batch of pages; leave a comparable batch untouched (control).
- Compare 28 days before vs 28 days after the change goes live (matched weekdays), from Search Console
  page+query data. Primary metric: change in impression-weighted average position, minus the control
  batch's change. Secondary: impressions and number of ranking queries. Use CTR only once a page has
  more than 1,000 impressions in each window.
- Note Google core updates; a test whose window overlaps one is inconclusive.
- Revert a change only on a clear loss (position worse by 5+ on its main query vs control).

## Baseline (Search Console, 3 months to 2026-10-25)
3 clicks, 4.67K impressions, avg position 13.9. 50 pages indexed; 10 "crawled, not indexed"
(statistics, ozempic-body-face-muscle, signs-of-muscle-loss, women-over-50, home-tests,
protein-timing, build-new-muscle, protein-on-glp1, research 07-13 and 07-20).

## Test 1: answer-first titles and intro blocks (live 2026-10-28 06:00 build, or the build after merge)
Treatment pages and main query (position at baseline):
- /protein-calculator/: "glp 1 protein calculator" 83, "zepbound protein calculator" 75; guard: "glp 1 calorie calculator" 4, "glp-1 calorie calculator" 10.
  Revert title order if the calorie queries fall below 15.
- /learn/creatine-and-ozempic/: "creatine and glp-1" 77, "can you take creatine while on tirzepatide" ~50.
- /learn/glp1-vegan-vegetarian-protein/: page avg 22.4; "which brands offer plant-based protein shakes suitable for glp-1 patients?" 74.
- /learn/glp1-intermittent-fasting-muscle/: "glp 1 and intermittent fasting" 71.
- /learn/ozempic-muscle-loss/: page avg 29.2; "does ozempic cause muscle loss" 74, "ozempic muscle loss" 30.
Control (untouched for 28 days): /learn/best-exercises-preserve-muscle-glp1/ (15.8),
/learn/cardio-vs-weights-glp1/ (8.0), /learn/glp1-knee-osteoarthritis-pain/ (11.9),
/learn/ozempic-loose-skin-vs-muscle/ (9.7), /learn/retatrutide-muscle-loss/ (8.5).
Read-out: 2026-11-25 or later.

## Test 2: answer-first titles and short-answer boxes, batch 2 (#126, live at the 2026-10-28 06:00 build)
These pages showed at average position 8-10 with 0 clicks (a snippet problem, not a ranking one).
Primary metric here: impressions and clicks at matched position, with page-level position as a guard.
- /learn/build-muscle-glp1-no-gym/ (346 impressions, pos 8.7)
- /learn/glp1-high-protein-meals-nausea/ (281, pos 9.9)
- /learn/best-protein-for-muscle-on-glp1/ (146, pos 8.4)
- /learn/beginner-resistance-training-glp1/ (863, pos 7.7; most impressions are bot "repetitions in reserve" lookups, so filter those queries out)
Control: the same five pages as test 1. Read-out: 2026-11-25 or later.

## New page: /learn/keep-muscle-on-glp1/ (#127)
Pillar for "how to maintain muscle on glp 1" (86-95), "how to build muscle on glp 1" (82), "glp1 workouts" (79).
No baseline page; track whether it indexes and which queries it picks up.

## Test 3: answer-first on the pages Copilot already cites (#128, live at the first scheduled build after 2026-10-28 merge)
Bing AI Performance, 2026-10-09 to 10-25 (citations): glp1-tendon-joint-injury-risk 11, glp1-bone-density-fracture-risk 6,
glp1-micronutrients-vitamin-d-b12-iron 1 (best-protein-for-muscle-on-glp1, 18, changed in test 2).
Primary metric: Bing AI citations per page (Bing Webmaster Tools > AI Performance > Pages), 28 days before vs after.
Secondary: Google position for each page. Read-out: 2026-11-25 or later.
