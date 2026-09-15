/**
 * Backfills chapter_number / chapter_name / chapter_name_arabic on the
 * `hadiths` table using the standard sunnah.com book breakdown.
 *
 * Matching strategy: since hadith numbering schemes differ between digitized
 * sources (e.g. our Bukhari total is 7580 rows vs 7277 in the reference
 * dataset), matching by position/hadith_number is NOT reliable across a full
 * collection. Instead we match by the normalized hadith TEXT itself, which is
 * stable regardless of which numbering scheme either side uses:
 *
 *   1. Try an exact match on the first 200 normalized characters
 *      (narrator + hadith text) against the reference index ("long" tier).
 *   2. If that misses (e.g. minor punctuation/whitespace drift), fall back
 *      to the first 60 normalized characters ("short" tier). Short keys that
 *      were ambiguous (matched >1 hadith in the reference set) were dropped
 *      when the reference files were built, so a short-tier hit is still a
 *      confident match.
 *   3. Anything that still doesn't match is left alone (chapter_number stays
 *      null) and counted in the summary printed at the end — spot check
 *      those manually rather than guessing.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node backfill-chapters.js
 *
 * Requires: npm install @supabase/supabase-js
 * Requires: run sql/001_add_chapter_columns.sql first.
 * Requires: the reference/*.json files sitting next to this script (or set
 *           REFERENCE_DIR below).
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const REFERENCE_DIR = path.join(__dirname, '..', 'reference');
const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 500;

// Map the `book` column's actual values (as stored in your DB) to the
// reference file name. Run `select distinct book from hadiths;` in Supabase
// and adjust the left-hand side of any line that doesn't already match.
const BOOK_SLUG_TO_FILE = {
    bukhari: 'bukhari',
    muslim: 'muslim',
    abudawud: 'abudawud',
    'abu-dawud': 'abudawud',
    'abu_dawud': 'abudawud',
    tirmidhi: 'tirmidhi',
    nasai: 'nasai',
    "an-nasai": 'nasai',
    ibnmajah: 'ibnmajah',
    'ibn-majah': 'ibnmajah',
    'ibn_majah': 'ibnmajah',
    malik: 'malik',
    muwatta: 'malik',
    'muwatta-malik': 'malik',
};

// Some rows write the peace-be-upon-him honorific as the Arabic symbol
// (ﷺ) — same as the reference dataset — while others spell it out as a
// bracketed abbreviation like [SAW]. The symbol is already invisible to
// fingerprinting (it's not a letter/digit), but "[SAW]" contributes real
// letters ("saw") that the reference side doesn't have at that position,
// throwing off the match. Strip these bracketed abbreviations first so
// both notations collapse to the same nothing.
function stripHonorifics(s) {
    return (s || '').replace(/[[(]\s*(s\.?a\.?w\.?s?\.?|pbuh|swt|ra{1,2}|as)\s*[\])]/gi, '');
}

// Strips ALL punctuation/whitespace and lowercases, leaving a pure
// alphanumeric "fingerprint". This DB mixes formatting conventions across
// import batches (some rows use a straight apostrophe with a space after
// the narrator's colon, e.g. "Narrated 'Umar bin Al-Khattab: I heard...";
// others use a backtick with no space, e.g. "Narrated `Abdullah...:I
// heard..."). Comparing raw character windows broke on that difference.
// Comparing fingerprints doesn't care — the punctuation is gone either way.
function normalize(s) {
    return stripHonorifics(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function loadReferenceIndex(fileName) {
    const filePath = path.join(REFERENCE_DIR, `${fileName}.json`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing reference file: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
        process.exit(1);
    }
    const supabase = createClient(url, key);

    // Discover which `book` slugs actually exist in the table. Paginated
    // deliberately: an unbounded select is capped at PostgREST's default
    // max-rows (1000), which would silently only "discover" whichever
    // book happens to dominate the first page instead of all of them.
    const distinctBooks = new Set();
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data: bookRows, error: bookErr } = await supabase
            .from('hadiths')
            .select('book')
            .not('book', 'is', null)
            .range(from, from + PAGE_SIZE - 1);
        if (bookErr) throw bookErr;
        if (!bookRows.length) break;
        bookRows.forEach((r) => distinctBooks.add(r.book));
        if (bookRows.length < PAGE_SIZE) break;
    }
    console.log('Found book slugs in DB:', [...distinctBooks]);

    const referenceCache = {};

    const summary = {}; // book -> { total, matchedLong, matchedShort, unmatched }

    for (const book of [...distinctBooks]) {
        const fileKey = BOOK_SLUG_TO_FILE[book];
        if (!fileKey) {
            console.warn(
                `\nNo reference file mapped for book="${book}" — skipping. ` +
                `Add it to BOOK_SLUG_TO_FILE if this is one of the 7 sources.`
            );
            continue;
        }
        if (!referenceCache[fileKey]) {
            referenceCache[fileKey] = loadReferenceIndex(fileKey);
        }
        const { long: longIndex, short: shortIndex } = referenceCache[fileKey];

        summary[book] = { total: 0, matchedLong: 0, matchedShort: 0, unmatched: 0 };

        // Keyset (id > lastId) pagination, NOT offset-based. The filter
        // below (chapter_number IS NULL) shrinks as rows get matched
        // *during this same loop*, which makes OFFSET pagination skip
        // rows: "OFFSET 1000" means something different once 990 rows
        // from page 1 have dropped out of the null-filter. Paging by id
        // instead is immune to that, since id never changes underneath us.
        let lastId = 0;
        for (;;) {
            const { data: rows, error } = await supabase
                .from('hadiths')
                .select('id, full_text, translation')
                .eq('book', book)
                .is('chapter_number', null) // safe to re-run
                .gt('id', lastId)
                .order('id', { ascending: true })
                .limit(PAGE_SIZE);
            if (error) throw error;
            if (!rows.length) break;

            const updates = [];

            for (const row of rows) {
                summary[book].total += 1;
                const text = normalize(row.full_text || row.translation || '');
                if (!text) {
                    summary[book].unmatched += 1;
                    continue;
                }

                let entry = longIndex[text.slice(0, 200)];
                if (entry) {
                    summary[book].matchedLong += 1;
                } else {
                    entry = shortIndex[text.slice(0, 60)];
                    if (entry) summary[book].matchedShort += 1;
                }

                if (!entry) {
                    summary[book].unmatched += 1;
                    continue;
                }

                updates.push({
                    id: row.id,
                    chapter_number: entry.n,
                    chapter_name: entry.t,
                    chapter_name_arabic: entry.a,
                });
            }

            for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
                const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
                const { error: rpcErr } = await supabase.rpc('apply_hadith_chapters', {
                    updates: batch,
                });
                if (rpcErr) throw rpcErr;
            }

            lastId = rows[rows.length - 1].id;

            console.log(
                `[${book}] processed up to id ${lastId} ` +
                `(matched ${updates.length}/${rows.length} this page)`
            );
        }
    }

    console.log('\n=== Backfill summary ===');
    for (const [book, s] of Object.entries(summary)) {
        const matched = s.matchedLong + s.matchedShort;
        const pct = s.total ? ((matched / s.total) * 100).toFixed(1) : '0.0';
        console.log(
            `${book}: ${matched}/${s.total} matched (${pct}%) ` +
            `[long=${s.matchedLong} short=${s.matchedShort} unmatched=${s.unmatched}]`
        );
    }
    console.log(
        '\nRows left with chapter_number = null are the unmatched ones — ' +
        'query them directly to spot-check:\n' +
        "  select id, source, hadith_number, left(full_text, 80) from hadiths where chapter_number is null;"
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
