import fetch from "node-fetch";
import dotenv from "dotenv";
import slugify from "slugify";
import crypto from "crypto";
import supabase from "../src/services/supabase.js";

dotenv.config();

const API_KEY = 'umh_72d419404f5a458398b616db15f0875e46e49729';
const BASE_URL = "https://ummahapi.com/api";

if (!API_KEY) {
    console.error("❌ Missing UMMAH_API_KEY in .env");
    process.exit(1);
}

/**
 * 🔥 CATEGORY NORMALIZATION
 */
const CATEGORY_MAP = {
    morning: "morning_evening",
    evening: "morning_evening",
    prayer: "after_salah",
    after_prayer: "after_salah",
    sleep: "before_sleep",
    waking: "waking_up",
    food: "eating_drinking",
    drink: "eating_drinking",
    travel: "travel",
    home: "entering_leaving_home",
    masjid: "mosque",
    distress: "distress_anxiety",
    forgiveness: "forgiveness",
    illness: "health_healing",
    weather: "rain",
    knowledge: "knowledge",
    parents: "family",
    gratitude: "gratitude",
    protection: "protection",
    dhikr: "dhikr",
    marriage: "marriage",
    grief: "death_grave",
    children: "children",
    business: "rizq_sustenance",
    night_prayer: "after_salah",
    quran_recitation: "knowledge",
};

const normalizeCategory = (input = "") => {
    const key = input.toLowerCase();
    return CATEGORY_MAP[key] || "general";
};

/**
 * 🔐 SLUG GENERATION
 */
const generateSlug = (title, arabic) => {
    const hash = crypto
        .createHash("md5")
        .update(arabic)
        .digest("hex")
        .slice(0, 8);

    return slugify(title || "dua", { lower: true, strict: true }) + "-" + hash;
};

/**
 * 🌐 FETCH HELPER
 */
const fetchAPI = async (url) => {
    try {
        const res = await fetch(url, {
            headers: {
                "X-API-Key": API_KEY,
            },
        });

        const json = await res.json();

        if (!json.success) {
            console.error("❌ API error:", url);
            return null;
        }

        return json.data;
    } catch (err) {
        console.error("❌ Fetch error:", err.message);
        return null;
    }
};

/**
 * 🚀 MAIN IMPORT (MERGE SAFE)
 */
const run = async () => {
    console.log("🚀 Starting UmmahAPI import...\n");

    const categoryRes = await fetchAPI(`${BASE_URL}/duas/categories`);

    if (!categoryRes || !categoryRes.categories) {
        console.error("❌ Failed to fetch categories");
        return;
    }

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const cat of categoryRes.categories) {
        console.log(`📂 Category: ${cat.id}`);

        const res = await fetchAPI(
            `${BASE_URL}/duas/category/${cat.id}`
        );

        if (!res || !res.duas) {
            console.warn(`⚠️ No duas found for ${cat.id}`);
            continue;
        }

        const duas = res.duas;

        for (const d of duas) {
            if (!d.arabic || d.arabic.length < 5) {
                totalSkipped++;
                continue;
            }

            const external_id = `ummah-${d.id}`;
            const category = normalizeCategory(d.category);

            // 🔍 CHECK EXISTING
            const { data: existing, error: fetchError } = await supabase
                .from("duas")
                .select("id, tags")
                .eq("external_id", external_id)
                .maybeSingle();

            if (fetchError) {
                console.error("❌ Fetch existing error:", fetchError.message);
                continue;
            }

            // 🔁 UPDATE EXISTING (MERGE TAGS)
            if (existing) {
                const mergedTags = [
                    ...new Set([...(existing.tags || []), category]),
                ];

                const { error: updateError } = await supabase
                    .from("duas")
                    .update({ tags: mergedTags })
                    .eq("id", existing.id);

                if (updateError) {
                    console.error("❌ Update error:", updateError.message);
                } else {
                    totalUpdated++;
                }

                continue;
            }

            // 🆕 INSERT NEW
            const { error: insertError } = await supabase.from("duas").insert({
                external_id,
                slug: generateSlug(d.title, d.arabic),
                title: d.title || null,
                arabic: d.arabic,
                translation: d.translation || null,
                transliteration: d.transliteration || null,
                reference: d.source || null,
                category,
                tags: [category],
                source: "ummahapi",
            });

            if (insertError) {
                console.error("❌ Insert error:", insertError.message);
            } else {
                totalInserted++;
            }
        }

        console.log("-----------------------------\n");
    }

    console.log("🎉 IMPORT COMPLETE");
    console.log("=================================");
    console.log(`✅ Inserted: ${totalInserted}`);
    console.log(`🔁 Updated (merged): ${totalUpdated}`);
    console.log(`⚠️ Skipped: ${totalSkipped}`);
    console.log("=================================");
};

run();