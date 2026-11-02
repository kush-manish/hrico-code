/* Rebuilds the DP-1..DP-7 study lists in membership.json.
 *
 * The lists were originally seeded with two problems each as a placeholder.
 * Every slug below is checked against details.json, so a typo fails loudly
 * rather than producing a list entry the Coding tab cannot open.
 *
 * Usage: node server/seed-dp-lists.js [--dry]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(__dirname, '../../Companies/Google/.raw');
const DETAILS = path.join(RAW, 'details.json');
const MEMBERSHIP = path.join(RAW, 'membership.json');

// Ordered easiest-first inside each bucket so the list doubles as a study path.
const LISTS = {
  'DP-1-Memoization-Tabulation': [
    'fibonacci-number', 'climbing-stairs', 'n-th-tribonacci-number',
    'min-cost-climbing-stairs', 'counting-bits', 'pascals-triangle',
    'is-subsequence', 'integer-break', 'unique-binary-search-trees',
    'number-of-sub-arrays-with-odd-sum',
  ],
  'DP-2-Constant-Transition': [
    'best-time-to-buy-and-sell-stock', 'maximum-subarray', 'house-robber',
    'house-robber-ii', 'maximum-product-subarray', 'decode-ways',
    'best-sightseeing-pair', 'maximum-sum-circular-subarray', 'house-robber-iii',
    'count-ways-to-build-good-strings', 'maximum-absolute-sum-of-any-subarray',
    'best-time-to-buy-and-sell-stock-ii', 'best-time-to-buy-and-sell-stock-iii',
    'best-time-to-buy-and-sell-stock-iv', 'house-robber-iv',
  ],
  'DP-3-Grid-2D': [
    'unique-paths', 'unique-paths-ii', 'minimum-path-sum', 'maximal-square',
    'minimum-falling-path-sum', 'count-square-submatrices-with-all-ones',
    '01-matrix', 'dungeon-game', 'maximal-rectangle',
    'longest-increasing-path-in-a-matrix', 'cherry-pickup',
    'number-of-paths-with-max-score',
  ],
  'DP-4-Two-Sequences': [
    'longest-common-subsequence', 'edit-distance', 'distinct-subsequences',
    'shortest-common-supersequence', 'distinct-subsequences-ii',
    'regular-expression-matching', 'wildcard-matching',
    'number-of-ways-to-form-a-target-string-given-a-dictionary',
  ],
  'DP-5-Interval': [
    'longest-palindromic-substring', 'palindromic-substrings',
    'longest-palindromic-subsequence', 'predict-the-winner', 'stone-game',
    'stone-game-ii', 'palindrome-partitioning', 'palindrome-partitioning-ii',
    'burst-balloons', 'minimum-cost-to-cut-a-stick', 'stone-game-iii',
    'scramble-string', 'count-palindromic-subsequences',
  ],
  'DP-6-Non-Constant-Transition': [
    'jump-game', 'jump-game-ii', 'word-break', 'longest-increasing-subsequence',
    'largest-divisible-subset', 'partition-array-for-maximum-sum',
    'longest-arithmetic-subsequence-of-given-difference',
    'length-of-longest-fibonacci-subsequence', 'russian-doll-envelopes',
    'word-break-ii', 'frog-jump', 'concatenated-words',
    'longest-increasing-subsequence-ii', 'stickers-to-spell-word',
    'split-array-largest-sum',
  ],
  'DP-7-Knapsack': [
    'perfect-squares', 'coin-change', 'coin-change-ii', 'target-sum',
    'partition-equal-subset-sum', 'ugly-number-ii', 'minimum-cost-for-tickets',
    'number-of-dice-rolls-with-target-sum', 'the-number-of-good-subsets',
    'minimum-number-of-days-to-eat-n-oranges',
    'partition-array-into-two-arrays-to-minimize-sum-difference',
  ],
};

const details = JSON.parse(fs.readFileSync(DETAILS, 'utf8'));
const membership = JSON.parse(fs.readFileSync(MEMBERSHIP, 'utf8'));

const missing = [];
const built = {};
for (const [name, slugs] of Object.entries(LISTS)) {
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length) throw new Error(`${name}: duplicate slugs ${dupes.join(', ')}`);
  built[name] = slugs.map(slug => {
    const q = details[slug];
    if (!q) { missing.push(`${name}/${slug}`); return null; }
    return {
      id: String(q.questionFrontendId),
      slug,
      title: q.title,
      difficulty: String(q.difficulty).toUpperCase(),
      status: null,
      frequency: null,
      acRate: null,
    };
  }).filter(Boolean);
}

if (missing.length) {
  console.error(`no metadata for ${missing.length} slug(s):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

for (const [name, items] of Object.entries(built)) {
  const before = membership[name]?.length ?? 0;
  membership[name] = items;
  console.log(`${name.padEnd(30)} ${String(before).padStart(3)} -> ${items.length}`);
}

if (process.argv.includes('--dry')) {
  console.log('\ndry run, nothing written');
  process.exit(0);
}

const tmp = `${MEMBERSHIP}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(membership, null, 2));
fs.renameSync(tmp, MEMBERSHIP);
console.log(`\nwrote ${MEMBERSHIP}`);
