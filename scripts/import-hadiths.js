import supabase from '../src/services/supabase.js';

const API_KEY = 'umh_72d419404f5a458398b616db15f0875e46e49729';

const BASE_URL = 'https://ummahapi.com/api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 🔥 Safe fetch wrapper
 */
const fetchJSON = async (url) => {
    const res = await fetch(url, {
        headers: {
            'X-API-Key': API_KEY,
        },
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();

    if (!json.success || !json.data) {
        throw new Error('Invalid API response');
    }

    return json.data;
};

/**
 * 📚 Get all collections
 */
const fetchCollections = async () => {
    const data = await fetchJSON(`${BASE_URL}/hadith/collections`);
    return data.collections || [];
};

/**
 * 📄 Fetch paginated hadiths
 */
const fetchHadithPage = async (collectionKey, page) => {
    const data = await fetchJSON(
        `${BASE_URL}/hadith/${collectionKey}?page=${page}`
    );

    return data.hadiths || [];
};

/**
 * 🔄 Map API → DB schema
 */
const mapHadith = (h) => {
    // 🚫 HARD FILTER (avoid garbage rows)
    if (!h?.id || !h?.english || !h?.arabic) return null;

    return {
        external_id: h.id, // 🔥 CRITICAL UNIQUE KEY

        book: h.collection || null,
        source: h.collection_name || null,

        hadith_number: h.hadithnumber?.toString() || null,

        arabic: h.arabic,
        full_text: h.english,

        translation: h.english, // optional (keep for UI compatibility)

        grade: h.grade || null,

        reference: `${h.collection || ''} ${h.hadithnumber || ''}`.trim(),

        language: 'en',

        tags: h.collection ? [h.collection] : [],
    };
};

/**
 * 🚀 MAIN IMPORT
 */
const run = async () => {
    console.log('🚀 Starting Hadith Import (UmmahAPI)...\n');

    const collections = await fetchCollections();

    let totalProcessed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const col of collections) {
        console.log(`📚 ${col.name} (${col.key})`);

        let page = 1;
        let hasMore = true;

        while (hasMore) {
            let hadiths;

            try {
                hadiths = await fetchHadithPage(col.key, page);
            } catch (err) {
                console.error(
                    `❌ API error (${col.key}, page ${page}):`,
                    err.message
                );
                break;
            }

            if (!hadiths.length) {
                hasMore = false;
                break;
            }

            const mapped = hadiths
                .map(mapHadith)
                .filter(Boolean);

            if (!mapped.length) {
                totalSkipped += hadiths.length;
                page++;
                continue;
            }

            const { error } = await supabase
                .from('hadiths')
                .upsert(mapped, {
                    onConflict: 'external_id',
                });

            if (error) {
                console.error('❌ DB error:', error.message);
                break;
            }

            totalProcessed += hadiths.length;
            totalInserted += mapped.length;

            console.log(`   Page ${page} → ${mapped.length}`);

            page++;

            // ⚠️ Prevent rate spikes
            await sleep(120);
        }

        console.log('-----------------------------\n');
    }

    console.log('🎉 IMPORT COMPLETE');
    console.log('=================================');
    console.log(`📊 Processed: ${totalProcessed}`);
    console.log(`✅ Inserted/Updated: ${totalInserted}`);
    console.log(`⚠️ Skipped: ${totalSkipped}`);
    console.log('=================================');
};

run();