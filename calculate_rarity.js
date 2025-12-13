import fs from 'fs';
import axios from 'axios';

// ==========================================
// KONFİQURASİYA
// ==========================================
const CID = "QmawxnmmzngbiYe1PSgc9YEthFX11uiTtT6YPdUdLD3x3E";
const TOTAL_SUPPLY = 2200;

// Ehtiyat Gateway Siyahısı (Biri işləməsə digərinə keçəcək)
const GATEWAYS = [
    "https://dweb.link/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/"
];

// Köməkçi funksiya: Metadata yükləmək üçün (Retry ilə)
async function fetchMetadata(id) {
    for (const gateway of GATEWAYS) {
        try {
            const url = `${gateway}${CID}/${id}.json`;
            // 8 saniyə gözləyirik, cavab gəlməsə o biri gateway-ə keçirik
            const { data } = await axios.get(url, { timeout: 8000 });
            return data;
        } catch (err) {
            // Xəta olsa davam edir (növbəti gateway-i yoxlayır)
            continue;
        }
    }
    throw new Error(`Bütün gateway-lər xəta verdi`);
}

async function generateRarity() {
    console.log("🚀 Rarity hesablaması başladı... (Bu proses bir neçə dəqiqə çəkə bilər)");
    
    let allNFTs = [];
    let traitCounts = {};

    if (!fs.existsSync('public')){
        fs.mkdirSync('public');
    }

    // ------------------------------------------
    // 1. METADATA YÜKLƏMƏ
    // ------------------------------------------
    for (let i = 1; i <= TOTAL_SUPPLY; i++) {
        try {
            // Yeni funksiyamızı çağırırıq
            const data = await fetchMetadata(i);
            
            const attributes = data.attributes || [];
            allNFTs.push({ id: i, attributes: attributes });

            attributes.forEach(attr => {
                const key = `${attr.trait_type}||${attr.value}`;
                if (!traitCounts[key]) traitCounts[key] = 0;
                traitCounts[key]++;
            });

            // Hər 50 NFT-dən bir məlumat ver
            if (i % 50 === 0) console.log(`✅ Processed: ${i}/${TOTAL_SUPPLY}`);

        } catch (error) {
            console.error(`❌ Error loading #${i}: ${error.message}`);
            // Xəta olsa belə boş array ilə davam et ki, sistem dayanmasın
            allNFTs.push({ id: i, attributes: [] });
        }

        // Serveri yormamaq üçün 50ms gözləyirik
        await new Promise(r => setTimeout(r, 50));
    }

    console.log("🧮 Score və Rank hesablanır...");

    // ------------------------------------------
    // 2. RARITY SCORE HESABLAMA
    // ------------------------------------------
    let nftsWithScore = allNFTs.map(nft => {
        let totalScore = 0;
        let processedTraits = [];

        nft.attributes.forEach(attr => {
            const key = `${attr.trait_type}||${attr.value}`;
            const count = traitCounts[key];
            const percentRaw = (count / TOTAL_SUPPLY);
            const percentDisplay = (percentRaw * 100).toFixed(1) + "%";
            
            // Score = 1 / faiz
            let score = 0;
            if(percentRaw > 0) score = 1 / percentRaw;
            
            totalScore += score;

            processedTraits.push({
                trait_type: attr.trait_type,
                value: attr.value,
                percent: percentDisplay,
                score: score
            });
        });

        return {
            id: nft.id,
            totalScore: totalScore,
            traits: processedTraits
        };
    });

    // ------------------------------------------
    // 3. RANKING
    // ------------------------------------------
    nftsWithScore.sort((a, b) => b.totalScore - a.totalScore);

    // ------------------------------------------
    // 4. FINAL JSON
    // ------------------------------------------
    let finalMap = {};
    
    nftsWithScore.forEach((nft, index) => {
        const rank = index + 1;
        let type = "common";
        
        if (rank <= 22) type = "mythic";
        else if (rank <= 132) type = "legendary";
        else if (rank <= 462) type = "epic";
        else if (rank <= 1122) type = "rare";
        else type = "common";

        finalMap[nft.id] = {
            rank: rank,
            type: type,
            score: nft.totalScore.toFixed(2),
            traits: nft.traits 
        };
    });

    // Faylı yaz
    const outputPath = 'public/rarity_data.json';
    fs.writeFileSync(outputPath, JSON.stringify(finalMap, null, 2));
    
    console.log(`✅ Uğurlu! '${outputPath}' faylı yaradıldı.`);
}

generateRarity();
