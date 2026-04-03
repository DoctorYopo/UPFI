const ADDITIVE_DATABASE = {
    // Colors
    'E129': { name: 'Allura Red AC', group: 4, risk: 'High', effects: 'Linked to hyperactivity in children, possible allergic reactions.' },
    'E133': { name: 'Brilliant Blue FCF', group: 4, risk: 'High', effects: 'Possible hypersensitivity, GI issues in sensitive individuals.' },
    'E150': { name: 'Caramel Color', group: 4, risk: 'Moderate', effects: 'May contain carcinogenic byproducts depending on processing method.' },
    
    // Preservatives
    'E211': { name: 'Sodium Benzoate', group: 4, risk: 'High', effects: 'When combined with ascorbic acid, can form benzene (a carcinogen). May exacerbate asthma.' },
    'E250': { name: 'Sodium Nitrite', group: 4, risk: 'High', effects: 'Forms carcinogenic nitrosamines when cooked at high heat. Linked to migraines.' },
    
    // Antioxidants
    'E320': { name: 'BHA (Butylated hydroxyanisole)', group: 4, risk: 'High', effects: 'Anticipated human carcinogen, endocrine disruptor.' },
    'E321': { name: 'BHT (Butylated hydroxytoluene)', group: 4, risk: 'High', effects: 'Animal testing shows thyroid changes, liver and kidney issues.' },
    
    // Thickeners / Emulsifiers
    'E407': { name: 'Carrageenan', group: 4, risk: 'Moderate', effects: 'Linked to digestive inflammation, bloating, and irritable bowel syndrome.' },
    'E433': { name: 'Polysorbate 80', group: 4, risk: 'Moderate', effects: 'Disrupts gut microbiome, potentially leading to intestinal inflammation.' },
    'E466': { name: 'Cellulose Gum', group: 4, risk: 'Moderate', effects: 'May alter gut flora, promoting obesity and metabolic syndrome.' },
    
    // Flavor Enhancers
    'E621': { name: 'Monosodium Glutamate', group: 4, risk: 'Moderate', effects: 'Headaches, nausea, sweating, and weakness in sensitive individuals.' },
    
    // Sweeteners
    'E951': { name: 'Aspartame', group: 4, risk: 'High', effects: 'Possible carcinogen, associated with headaches and mood changes.' },
    'E955': { name: 'Sucralose', group: 4, risk: 'High', effects: 'Reduces beneficial gut bacteria, impacts insulin response.' },
    'E960': { name: 'Steviol Glycosides (Stevia)', group: 3, risk: 'Low', effects: 'Generally recognized as safe, heavily processed but minimal known risks.' }
};

// Aliases mapping natural language names directly to our records
const TEXT_ALIASES = {
    'msg': 'E621',
    'monosodium glutamate': 'E621',
    'aspartame': 'E951',
    'sucralose': 'E955',
    'splenda': 'E955',
    'carrageenan': 'E407',
    'sodium benzoate': 'E211',
    'high fructose corn syrup': { name: 'High Fructose Corn Syrup', group: 4, risk: 'High', effects: 'Major driver of metabolic disease, fatty liver, and obesity.' },
    'maltodextrin': { name: 'Maltodextrin', group: 4, risk: 'Moderate', effects: 'Very high glycemic index, spikes blood sugar radically and alters gut bacteria.' },
    'artificial flavor': { name: 'Artificial Flavoring', group: 4, risk: 'Moderate', effects: 'Unknown proprietary chemical composites; possible allergens.' },
    'artificial flavour': { name: 'Artificial Flavoring', group: 4, risk: 'Moderate', effects: 'Unknown proprietary chemical composites; possible allergens.' },
    'natural flavor': { name: 'Natural Flavoring', group: 3, risk: 'Low', effects: 'Highly processed extracts; minimal chemical risk but indicates a processed product.' },
    'soy lecithin': { name: 'Soy Lecithin', group: 3, risk: 'Low', effects: 'Common emulsifier, safe for most but highly processed.' },
    'hydrogenated': { name: 'Hydrogenated Oils', group: 4, risk: 'High', effects: 'Contains trans fats, severely impacting cardiovascular health.' },
    'potassium sorbate': { name: 'Potassium Sorbate', group: 4, risk: 'Moderate', effects: 'Can cause mild DNA damage in somatic cells over long periods.'}
};

/**
 * Parses OCR extracted text to find known additives.
 * @param {string} text 
 */
function analyzeIngredients(text) {
    const textLower = text.toLowerCase().replace(/\s+/g, ' ');
    let foundAdditives = [];
    
    // 1. Check for E-numbers (e.g., E129, E 129, E-129)
    const eNumberRegex = /e\s?-?[0-9]{3}a?/g;
    const eMatches = textLower.match(eNumberRegex);
    
    if (eMatches) {
        eMatches.forEach(match => {
            const cleanE = match.replace(/[^0-9a]/g, '').toUpperCase();
            const eKey = 'E' + cleanE;
            if (ADDITIVE_DATABASE[eKey]) {
                if (!foundAdditives.find(a => a.id === eKey)) {
                    foundAdditives.push({ id: eKey, ...ADDITIVE_DATABASE[eKey] });
                }
            } else {
                // Unknown E-number fallback
                if (!foundAdditives.find(a => a.id === eKey)) {
                    foundAdditives.push({ id: eKey, name: `Food Additive (${eKey})`, group: 3, risk: 'Unknown', effects: 'Unclassified processed additive.'});
                }
            }
        });
    }

    // 2. Check for Text Aliases
    for (const [alias, data] of Object.entries(TEXT_ALIASES)) {
        if (textLower.includes(alias)) {
            if (typeof data === 'string') {
                // Maps to an E-number
                const eNum = data;
                if (!foundAdditives.find(a => a.id === eNum)) {
                    foundAdditives.push({ id: eNum, ...ADDITIVE_DATABASE[eNum] });
                }
            } else {
                // Distinct object
                if (!foundAdditives.find(a => a.name === data.name)) {
                    foundAdditives.push({ id: alias.replace(/\s/g, '_'), ...data });
                }
            }
        }
    }

    // 3. Determine NOVA classification (1 to 4)
    let overallNova = 1;
    let description = "Unprocessed or Minimally Processed";

    if (foundAdditives.length > 0) {
        overallNova = 3; // Baseline if additives are found
        description = "Processed Food";
        
        // If *any* ingredient is Nova 4, product is Nova 4
        if (foundAdditives.some(a => a.group === 4)) {
            overallNova = 4;
            description = "Ultra-Processed Food";
        }
    } else if (textLower.includes("sugar") || textLower.includes("salt") || textLower.includes("oil")) {
        // Simple heuristics if no major bad additives found but basic processed ingredients exist
        overallNova = 2;
        description = "Processed Culinary Ingredient";
    }

    return {
        novaGroup: overallNova,
        novaDesc: description,
        additives: foundAdditives
    };
}
