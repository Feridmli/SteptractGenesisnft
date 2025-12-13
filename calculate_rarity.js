import fs from 'fs';
import axios from 'axios';

// ==========================================
// KONFİQURASİYA
// ==========================================
const CID = "QmawxnmmzngbiYe1PSgc9YEthFX11uiTtT6YPdUdLD3x3E";
const TOTAL_SUPPLY = 2200; // Cəmi 2222 NFT olmalıdır

// GitHub Actions sürətli internetə malik olduğu üçün 'dweb.link' və ya 'ipfs.io' istifadə edə bilərik.
const GATEWAY = "https://dweb.link/ipfs/"; 

async function generateRarity() {
    console.log("🚀 Rarity hesablaması başladı... (Bu proses bir neçə dəqiqə çəkə bilər)");
    
    let allNFTs = [];
    let traitCounts = {};

    // 'public' qovluğunun mövcudluğunu yoxlayırıq, yoxdursa yaradırıq
    if (!fs.existsSync('public')){
        fs.mkdirSync('public');
    }

    // ------------------------------------------
    // 1. METADATA YÜKLƏMƏ (FETCHING)
    // ------------------------------------------
    for (let i = 1; i <= TOTAL_SUPPLY; i++) {
        try {
            const url = `${GATEWAY}${CID}/${i}.json`;
            const { data } = await axios.get(url);
            
            // Atributların boş olub-olmadığını yoxlayırıq
            const attributes = data.attributes || [];

            allNFTs.push({
                id: i,
                attributes: attributes
            });

            // Hər atributun sayını hesablayırıq
            attributes.forEach(attr => {
                // Key formatı: "Background||Red"
                const key = `${attr.trait_type}||${attr.value}`;
                if (!traitCounts[key]) traitCounts[key] = 0;
                traitCounts[key]++;
            });

            // Hər 100 NFT-dən bir log yazırıq ki, donmadığını bilək
            if (i % 100 === 0) console.log(`Processed: ${i}/${TOTAL_SUPPLY}`);

        } catch (error) {
            console.error(`Error loading NFT #${i}:`, error.message);
            // Xəta baş versə belə, boş atributla siyahıya əlavə edirik ki, sürüşmə olmasın
            allNFTs.push({ id: i, attributes: [] });
        }
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
            
            // Faiz hesablaması (0.01 = 1%)
            const percentRaw = (count / TOTAL_SUPPLY);
            const percentDisplay = (percentRaw * 100).toFixed(1) + "%";
            
            // Score düsturu: 1 bölünsün faiz (Nadir olanın balı çox olur)
            const score = 1 / percentRaw;
            
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
    // 3. RANKING (SIRALAMA)
    // ------------------------------------------
    // Ən çox bal toplayan (ən nadir) Rank #1 olur
    nftsWithScore.sort((a, b) => b.totalScore - a.totalScore);

    // ------------------------------------------
    // 4. FINAL JSON FORMATININ HAZIRLANMASI
    // ------------------------------------------
    let finalMap = {};
    
    nftsWithScore.forEach((nft, index) => {
        const rank = index + 1;
        
        // Sizin təyin etdiyiniz bölgüyə əsasən Rarity Tier-ləri
        let type = "common";
        
        if (rank <= 22) {
            type = "mythic";       // 1-dən 22-yə qədər
        } else if (rank <= 132) {
            type = "legendary";    // 23-dən 132-yə qədər
        } else if (rank <= 462) {
            type = "epic";         // 133-dən 462-yə qədər
        } else if (rank <= 1122) {
            type = "rare";         // 463-dən 1122-yə qədər
        } else {
            type = "common";       // 1123-dən 2222-yə qədər
        }

        // Map obyektini doldururuq (ID -> Data)
        finalMap[nft.id] = {
            rank: rank,
            type: type,
            score: nft.totalScore.toFixed(2),
            traits: nft.traits // Hazır faizlərlə birlikdə
        };
    });

    // ------------------------------------------
    // 5. FAYLA YAZILMA
    // ------------------------------------------
    const outputPath = 'public/rarity_data.json';
    fs.writeFileSync(outputPath, JSON.stringify(finalMap, null, 2));
    
    console.log(`✅ Uğurlu! '${outputPath}' faylı yaradıldı.`);
}

// Funksiyanı işə salırıq
generateRarity();
