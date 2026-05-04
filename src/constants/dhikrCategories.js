/**
 * src/constants/dhikrCategories.js
 *
 * Single source of truth for all preset dhikr phrases used in AddDhikrScreen.
 * Organised into categories so the picker can group them clearly.
 *
 * Each entry shape:
 * {
 *   id:          string   — stable unique key (never changes, safe to store in AsyncStorage)
 *   title:       string   — common transliterated name
 *   arabic:      string   — authentic Arabic text
 *   translation: string   — English meaning
 *   target:      number   — recommended repetition count
 *   category:    string   — matches the parent category key below
 * }
 */

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// Each category has:  key, label, arabicLabel, color (accent for the UI card)
// ─────────────────────────────────────────────────────────────────────────────

export const DHIKR_CATEGORIES = [
    {
        key:          'tasbih',
        label:        'Tasbih',
        arabicLabel:  'تسبيح',
        description:  'Glorification of Allah',
        color:        '#C9A84C',   // gold
    },
    {
        key:          'tahmid',
        label:        'Tahmid',
        arabicLabel:  'تحميد',
        description:  'Praise of Allah',
        color:        '#E8A838',   // amber
    },
    {
        key:          'takbir',
        label:        'Takbir',
        arabicLabel:  'تكبير',
        description:  'Magnification of Allah',
        color:        '#D4896A',   // terracotta
    },
    {
        key:          'tahlil',
        label:        'Tahlil',
        arabicLabel:  'تهليل',
        description:  'Declaration of Oneness',
        color:        '#7EC8A4',   // sage green
    },
    {
        key:          'istighfar',
        label:        'Istighfar',
        arabicLabel:  'استغفار',
        description:  'Seeking forgiveness',
        color:        '#82B4D4',   // soft blue
    },
    {
        key:          'salawat',
        label:        'Salawat',
        arabicLabel:  'صلوات',
        description:  'Blessings on the Prophet ﷺ',
        color:        '#A78BDA',   // mauve
    },
    {
        key:          'dua',
        label:        "Du'a & Supplication",
        arabicLabel:  'دعاء',
        description:  'Personal supplications',
        color:        '#5ABFBF',   // teal
    },
    {
        key:          'morning_evening',
        label:        'Morning & Evening',
        arabicLabel:  'أذكار الصباح والمساء',
        description:  'Daily adhkar',
        color:        '#E8C97A',   // warm yellow
    },
    {
        key:          'custom',
        label:        'My Custom Dhikr',
        arabicLabel:  'أذكار مخصصة',
        description:  'Dhikr you have added yourself',
        color:        '#4CAF7D',   // green
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PRESET PHRASES (used in AddDhikrScreen preset picker)
// ─────────────────────────────────────────────────────────────────────────────

export const DHIKR_PRESETS = [

    // ── Tasbih ──────────────────────────────────────────────────────────────
    {
        id:          'tasbih_01',
        title:       'SubhanAllah',
        arabic:      'سُبْحَانَ ٱللَّٰهِ',
        translation: 'Glory be to Allah',
        target:      33,
        category:    'tasbih',
    },
    {
        id:          'tasbih_02',
        title:       'SubhanAllahi wa bihamdihi',
        arabic:      'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ',
        translation: 'Glory and praise be to Allah',
        target:      100,
        category:    'tasbih',
    },
    {
        id:          'tasbih_03',
        title:       "SubhanAllahi al-'Azim",
        arabic:      'سُبْحَانَ ٱللَّٰهِ ٱلْعَظِيمِ',
        translation: 'Glory be to Allah, the Magnificent',
        target:      100,
        category:    'tasbih',
    },
    {
        id:          'tasbih_04',
        title:       'SubhanAllahi wa bihamdihi, SubhanAllahi al-Azim',
        arabic:      'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ سُبْحَانَ ٱللَّٰهِ ٱلْعَظِيمِ',
        translation: 'Glory and praise be to Allah; glory be to Allah the Magnificent',
        target:      100,
        category:    'tasbih',
    },

    // ── Tahmid ──────────────────────────────────────────────────────────────
    {
        id:          'tahmid_01',
        title:       'Alhamdulillah',
        arabic:      'ٱلْحَمْدُ لِلَّٰهِ',
        translation: 'Praise be to Allah',
        target:      33,
        category:    'tahmid',
    },
    {
        id:          'tahmid_02',
        title:       'Alhamdulillahi Rabbil Alamin',
        arabic:      'ٱلْحَمْدُ لِلَّٰهِ رَبِّ ٱلْعَالَمِينَ',
        translation: 'Praise be to Allah, Lord of all the worlds',
        target:      33,
        category:    'tahmid',
    },
    {
        id:          'tahmid_03',
        title:       'Alhamdulillahi wa shukrulillah',
        arabic:      'ٱلْحَمْدُ لِلَّٰهِ وَشُكْرُ لِلَّٰهِ',
        translation: 'All praise and gratitude belong to Allah',
        target:      33,
        category:    'tahmid',
    },

    // ── Takbir ──────────────────────────────────────────────────────────────
    {
        id:          'takbir_01',
        title:       'Allahu Akbar',
        arabic:      'ٱللَّٰهُ أَكْبَرُ',
        translation: 'Allah is the Greatest',
        target:      33,
        category:    'takbir',
    },
    {
        id:          'takbir_02',
        title:       'Allahu Akbar Kabeera',
        arabic:      'ٱللَّٰهُ أَكْبَرُ كَبِيرًا',
        translation: 'Allah is truly the Greatest',
        target:      33,
        category:    'takbir',
    },

    // ── Tahlil ──────────────────────────────────────────────────────────────
    {
        id:          'tahlil_01',
        title:       'La ilaha illAllah',
        arabic:      'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ',
        translation: 'There is no god but Allah',
        target:      100,
        category:    'tahlil',
    },
    {
        id:          'tahlil_02',
        title:       'La ilaha illAllah wahdahu la sharika lah',
        arabic:      'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
        translation: 'None has the right to be worshipped but Allah, alone, without partner. To Him belongs all sovereignty and praise, and He is over all things omnipotent',
        target:      100,
        category:    'tahlil',
    },
    {
        id:          'tahlil_03',
        title:       'La ilaha illAllahu Muhammad Rasulullah',
        arabic:      'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ مُحَمَّدٌ رَسُولُ ٱللَّٰهِ',
        translation: 'There is no god but Allah, Muhammad is the Messenger of Allah',
        target:      100,
        category:    'tahlil',
    },

    // ── Istighfar ────────────────────────────────────────────────────────────
    {
        id:          'istighfar_01',
        title:       'Astaghfirullah',
        arabic:      'أَسْتَغْفِرُ ٱللَّٰهَ',
        translation: 'I seek forgiveness from Allah',
        target:      100,
        category:    'istighfar',
    },
    {
        id:          'istighfar_02',
        title:       'Astaghfirullahal Azim',
        arabic:      'أَسْتَغْفِرُ ٱللَّٰهَ ٱلْعَظِيمَ',
        translation: 'I seek forgiveness from Allah, the Magnificent',
        target:      100,
        category:    'istighfar',
    },
    {
        id:          'istighfar_03',
        title:       'Astaghfirullah wa atubu ilayh',
        arabic:      'أَسْتَغْفِرُ ٱللَّٰهَ وَأَتُوبُ إِلَيْهِ',
        translation: 'I seek forgiveness from Allah and repent to Him',
        target:      70,
        category:    'istighfar',
    },
    {
        id:          'istighfar_04',
        title:       'Sayyidul Istighfar',
        arabic:      'ٱللَّٰهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا ٱسْتَطَعْتُ أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ وَأَبُوءُ بِذَنْبِي فَٱغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ ٱلذُّنُوبَ إِلَّا أَنْتَ',
        translation: 'O Allah, You are my Lord. There is no god but You. You created me and I am Your servant, and I abide by Your covenant and promise as best I can. I seek refuge in You from the evil of what I have done. I acknowledge Your blessings upon me and confess my sins. So forgive me, for none forgives sins but You.',
        target:      1,
        category:    'istighfar',
    },

    // ── Salawat ──────────────────────────────────────────────────────────────
    {
        id:          'salawat_01',
        title:       'Salawat (short)',
        arabic:      'ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ',
        translation: 'O Allah, send blessings upon Muhammad ﷺ',
        target:      100,
        category:    'salawat',
    },
    {
        id:          'salawat_02',
        title:       'Salawat Ibrahimiyya',
        arabic:      'ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ',
        translation: 'O Allah, send blessings upon Muhammad and the family of Muhammad, as You sent blessings upon Ibrahim and the family of Ibrahim. Verily, You are Praiseworthy and Glorious.',
        target:      10,
        category:    'salawat',
    },
    {
        id:          'salawat_03',
        title:       'Allahumma salli wa sallim',
        arabic:      'ٱللَّٰهُمَّ صَلِّ وَسَلِّمْ عَلَىٰ نَبِيِّنَا مُحَمَّدٍ',
        translation: 'O Allah, send peace and blessings upon our Prophet Muhammad ﷺ',
        target:      100,
        category:    'salawat',
    },

    // ── Du'a & Supplication ──────────────────────────────────────────────────
    {
        id:          'dua_01',
        title:       'Hasbunallahu wa ni\'mal wakeel',
        arabic:      'حَسْبُنَا ٱللَّٰهُ وَنِعْمَ ٱلْوَكِيلُ',
        translation: 'Allah is sufficient for us and He is the best Disposer of affairs',
        target:      40,
        category:    'dua',
    },
    {
        id:          'dua_02',
        title:       'La hawla wala quwwata illa billah',
        arabic:      'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ',
        translation: 'There is no power nor strength except with Allah',
        target:      100,
        category:    'dua',
    },
    {
        id:          'dua_03',
        title:       'Rabbana atina fid dunya hasanah',
        arabic:      'رَبَّنَا آتِنَا فِي ٱلدُّنْيَا حَسَنَةً وَفِي ٱلْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ ٱلنَّارِ',
        translation: 'Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire',
        target:      7,
        category:    'dua',
    },
    {
        id:          'dua_04',
        title:       'Rabbi zidni ilma',
        arabic:      'رَبِّ زِدْنِي عِلْمًا',
        translation: 'My Lord, increase me in knowledge',
        target:      100,
        category:    'dua',
    },
    {
        id:          'dua_05',
        title:       'Allahumma inni asaluka al-afiyah',
        arabic:      'ٱللَّٰهُمَّ إِنِّي أَسْأَلُكَ ٱلْعَفْوَ وَٱلْعَافِيَةَ',
        translation: 'O Allah, I ask You for pardon and well-being',
        target:      3,
        category:    'dua',
    },
    {
        id:          'dua_06',
        title:       'Allahumma a\'inni ala dhikrika',
        arabic:      'ٱللَّٰهُمَّ أَعِنِّي عَلَىٰ ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
        translation: 'O Allah, help me to remember You, to be grateful to You, and to worship You in the best manner',
        target:      3,
        category:    'dua',
    },

    // ── Morning & Evening ────────────────────────────────────────────────────
    {
        id:          'morning_01',
        title:       'Ayat ul-Kursi',
        arabic:      'ٱللَّٰهُ لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ لَهُ مَا فِي ٱلسَّمَاوَاتِ وَمَا فِي ٱلْأَرْضِ',
        translation: 'Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth.',
        target:      1,
        category:    'morning_evening',
    },
    {
        id:          'morning_02',
        title:       'Bismillah (morning)',
        arabic:      'بِسْمِ ٱللَّٰهِ ٱلَّذِي لَا يَضُرُّ مَعَ ٱسْمِهِ شَيْءٌ فِي ٱلْأَرْضِ وَلَا فِي ٱلسَّمَاءِ وَهُوَ ٱلسَّمِيعُ ٱلْعَلِيمُ',
        translation: 'In the name of Allah with Whose name nothing can cause harm on earth or in the heavens, and He is the All-Hearing, the All-Knowing',
        target:      3,
        category:    'morning_evening',
    },
    {
        id:          'morning_03',
        title:       'Allahumma bika asbahna',
        arabic:      'ٱللَّٰهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ ٱلنُّشُورُ',
        translation: 'O Allah, by Your grace we have reached the morning, and by Your grace we have reached the evening, and by You we live and die, and to You is the resurrection',
        target:      1,
        category:    'morning_evening',
    },
    {
        id:          'morning_04',
        title:       'Subhanakallahumma wa bihamdik',
        arabic:      'سُبْحَانَكَ ٱللَّٰهُمَّ وَبِحَمْدِكَ أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ',
        translation: 'Glory be to You O Allah and with Your praise, I bear witness that there is no god but You, I seek Your forgiveness and repent to You',
        target:      3,
        category:    'morning_evening',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all presets for a given category key.
 * Usage: getPresetsByCategory('tasbih')
 */
export function getPresetsByCategory(categoryKey) {
    return DHIKR_PRESETS.filter(p => p.category === categoryKey);
}

/**
 * Returns the category metadata object for a given key.
 * Usage: getCategoryMeta('salawat')
 */
export function getCategoryMeta(categoryKey) {
    return DHIKR_CATEGORIES.find(c => c.key === categoryKey) ?? null;
}

/**
 * Returns all presets grouped under their category, ready to render a
 * SectionList or grouped FlatList.
 *
 * Shape: [{ category: {...}, presets: [...] }, ...]
 */
export function getGroupedPresets() {
    return DHIKR_CATEGORIES
        .filter(c => c.key !== 'custom')   // custom entries are user-created, not presets
        .map(category => ({
            category,
            presets: getPresetsByCategory(category.key),
        }))
        .filter(group => group.presets.length > 0);
}

/**
 * TARGET_OPTIONS — the set of quick-pick repetition counts shown as chips
 * in the AddDhikrScreen target selector.
 */
export const TARGET_OPTIONS = [11, 33, 99, 100, 200, 500, 1000];