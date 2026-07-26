const GUEST_LANGUAGES = Object.freeze({
    en: { nationality: 'US', label: 'English' },
    vi: { nationality: 'VN', label: 'Vietnamese' },
    fr: { nationality: 'FR', label: 'French' },
    zh: { nationality: 'CN', label: 'Chinese' },
    ja: { nationality: 'JP', label: 'Japanese' },
    ko: { nationality: 'KR', label: 'Korean' },
    th: { nationality: 'TH', label: 'Thai' },
    ru: { nationality: 'RU', label: 'Russian' }
});

const GUEST_ALLERGIES = Object.freeze([
    'Dairy',
    'Gluten',
    'Peanuts',
    'Tree nuts',
    'Shellfish',
    'Fish',
    'Eggs',
    'Soy',
    'Sesame',
    'Mustard',
    'Celery',
    'Sulphites'
]);

module.exports = { GUEST_LANGUAGES, GUEST_ALLERGIES };
