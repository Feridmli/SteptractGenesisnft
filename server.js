import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
const SEAPORT_CONTRACT_ADDRESS = process.env.SEAPORT_CONTRACT_ADDRESS;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false })); 
app.use(cors());
app.use(express.json({ limit: "10mb" })); 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

// 1. Statik fayllar (Frontend)
app.use(express.static(distPath));

// 2. Rarity Data üçün xüsusi yol (Ehtiyat üçün)
app.use('/rarity_data.json', express.static(path.join(distPath, 'rarity_data.json')));

// =============================================
// API ROUTES
// =============================================

// Stats API
app.get("/api/stats", async (req, res) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: allSales, error } = await supabase.from("orders").select("price, createdat");
        if (error) throw error;

        let totalVolume = 0;
        let dayVolume = 0;
        allSales.forEach(sale => {
            const p = parseFloat(sale.price || 0);
            totalVolume += p;
            if (sale.createdat > oneDayAgo) dayVolume += p;
        });
        res.json({ success: true, totalVolume, dayVolume });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// NFT List API
app.get("/api/nfts", async (req, res) => {
  const { data, error } = await supabase.from("metadata").select("*").order("tokenid", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ nfts: data });
});

// Create Order API
app.post("/api/order", async (req, res) => {
  const { tokenid, price, seller_address, seaport_order, order_hash } = req.body;
  if (!tokenid || !seaport_order) return res.status(400).json({ error: "Missing data" });

  const { error } = await supabase.from("metadata").upsert({
    tokenid: tokenid.toString(),
    price: price,
    seller_address: seller_address.toLowerCase(), 
    buyer_address: null, 
    seaport_order: seaport_order,
    order_hash: order_hash,
    nft_contract: NFT_CONTRACT_ADDRESS,          
    marketplace_contract: SEAPORT_CONTRACT_ADDRESS, 
    on_chain: false,
    updatedat: new Date().toISOString()
  }, { onConflict: "tokenid" });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Buy API
app.post("/api/buy", async (req, res) => {
  const { tokenid, buyer_address, price, seller } = req.body;
  if (!tokenid || !buyer_address) return res.status(400).json({ error: "Missing buying data" });

  const { error: metaError } = await supabase.from("metadata").update({
    buyer_address: buyer_address.toLowerCase(),
    seller_address: null, 
    price: 0,                   
    last_sale_price: price,     
    seaport_order: null,
    order_hash: null,
    on_chain: true,
    updatedat: new Date().toISOString()
  }).eq("tokenid", tokenid.toString());

  if (metaError) return res.status(500).json({ error: metaError.message });

  if (price && parseFloat(price) > 0) {
      await supabase.from("orders").insert({
          tokenid: tokenid.toString(),
          seller_address: seller ? seller.toLowerCase() : null,
          buyer_address: buyer_address.toLowerCase(),
          price: price,
          status: 'completed'
      });
  }
  res.json({ success: true });
});

app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
