import { Buffer } from "buffer";
window.Buffer = window.Buffer || Buffer;

import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ==========================================
// 1. SABİTLƏR (CONSTANTS)
// ==========================================

const ItemType = { NATIVE: 0, ERC20: 1, ERC721: 2, ERC1155: 3 };
const OrderType = { FULL_OPEN: 0, PARTIAL_OPEN: 1, FULL_RESTRICTED: 2, PARTIAL_RESTRICTED: 3 };

// Env Variables
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_NFT_CONTRACT || "0xf62049dd99d8a1fa57a31ce091282b2628acc301"; 
const SEAPORT_ADDRESS = "0x0000000000000068f116a894984e2db1123eb395";
const APECHAIN_RPC = import.meta.env.VITE_APECHAIN_RPC || "https://rpc.apechain.com";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const APECHAIN_ID = 33139;
const APECHAIN_ID_HEX = "0x8173";

// Global Variables
let provider = null;
let signer = null;
let seaport = null;
let userAddress = null;

let selectedTokens = new Set();
let allNFTs = []; 

// UI Elements
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const addrSpan = document.getElementById("addr");
const marketplaceDiv = document.getElementById("marketplace");
const noticeDiv = document.getElementById("notice");

// Bulk UI Elements
const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");
const bulkPriceInp = document.getElementById("bulkPrice");
const bulkListBtn = document.getElementById("bulkListBtn");
const bulkListActions = document.getElementById("bulkListActions");
const bulkBuyBtn = document.getElementById("bulkBuyBtn");
const bulkTotalPriceEl = document.getElementById("bulkTotalPrice");

const searchInput = document.getElementById("searchInput");
const totalVolEl = document.getElementById("totalVol");
const dayVolEl = document.getElementById("dayVol");
const itemsCountEl = document.getElementById("itemsCount");

// ==========================================
// 2. KÖMƏKÇİ FUNKSİYALAR
// ==========================================

function notify(msg, timeout = 4000) {
  if (!noticeDiv) return;
  const originalText = noticeDiv.textContent;
  noticeDiv.textContent = msg;
  
  noticeDiv.style.transform = "scale(1.05)";
  setTimeout(() => noticeDiv.style.transform = "scale(1)", 200);

  if (timeout) {
      setTimeout(() => { 
          if (noticeDiv.textContent === msg) noticeDiv.textContent = "Marketplace-ə xoş gəldiniz"; 
      }, timeout);
  }
}

function cleanOrder(orderData) {
  try {
    const order = orderData.order || orderData;
    const { parameters, signature } = order;
    if (!parameters) return null;
    const toStr = (val) => {
        if (val === undefined || val === null) return "0";
        if (typeof val === "object" && val.hex) return BigInt(val.hex).toString();
        return val.toString();
    };
    return {
      parameters: {
        offerer: parameters.offerer,
        zone: parameters.zone,
        offer: parameters.offer.map(item => ({
          itemType: Number(item.itemType), token: item.token,
          identifierOrCriteria: toStr(item.identifierOrCriteria || item.identifier),
          startAmount: toStr(item.startAmount), endAmount: toStr(item.endAmount)
        })),
        consideration: parameters.consideration.map(item => ({
          itemType: Number(item.itemType), token: item.token,
          identifierOrCriteria: toStr(item.identifierOrCriteria || item.identifier),
          startAmount: toStr(item.startAmount), endAmount: toStr(item.endAmount), recipient: item.recipient
        })),
        orderType: Number(parameters.orderType), startTime: toStr(parameters.startTime),
        endTime: toStr(parameters.endTime), zoneHash: parameters.zoneHash,
        salt: toStr(parameters.salt), conduitKey: parameters.conduitKey,
        counter: toStr(parameters.counter),
        totalOriginalConsiderationItems: Number(parameters.totalOriginalConsiderationItems || parameters.consideration.length)
      }, signature: signature
    };
  } catch (e) { return null; }
}

function orderToJsonSafe(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => {
    if (v && typeof v === "object") {
      if (ethers.BigNumber.isBigNumber(v)) return v.toString();
      if (v._hex) return ethers.BigNumber.from(v._hex).toString();
    }
    return v;
  }));
}

// ==========================================
// 3. CÜZDAN QOŞULMASI (WALLET CONNECT)
// ==========================================

function handleDisconnect() {
  provider = null;
  signer = null;
  seaport = null;
  userAddress = null;

  connectBtn.style.display = "inline-block";
  disconnectBtn.style.display = "none";
  addrSpan.textContent = "";
  addrSpan.style.display = "none";
  
  cancelBulk();
  renderNFTs(allNFTs); 
  notify("Çıxış edildi");
}

async function setupUserSession(account) {
    userAddress = account.toLowerCase();

    if (window.ethereum) {
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        signer = provider.getSigner();
        seaport = new Seaport(signer, { 
            overrides: { contractAddress: SEAPORT_ADDRESS, defaultConduitKey: ZERO_BYTES32 } 
        });
    }

    addrSpan.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    addrSpan.style.display = "inline-block";
    notify("Cüzdan qoşuldu!");
    
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    
    cancelBulk();
    renderNFTs(allNFTs);
}

async function handleAccountsChanged(accounts) {
  handleDisconnect();
}

async function connectWallet() {
  try {
    if (!window.ethereum) return alert("Metamask tapılmadı!");
    
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    
    const { chainId } = await provider.getNetwork();
    if (chainId !== APECHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: APECHAIN_ID_HEX, chainName: "ApeChain Mainnet",
            nativeCurrency: { name: "APE", symbol: "APE", decimals: 18 },
            rpcUrls: [APECHAIN_RPC],
            blockExplorerUrls: ["https://apescan.io"],
          }],
        });
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      } catch (e) { return alert("ApeChain şəbəkəsinə keçilmədi."); }
    }

    const accounts = await provider.send("eth_requestAccounts", []);
    
    if (accounts.length > 0) {
        await setupUserSession(accounts[0]);
    }

    if (signer && !signer.signTypedData) {
        signer.signTypedData = async (domain, types, value) => {
            const typesCopy = { ...types }; delete typesCopy.EIP712Domain; 
            return await signer._signTypedData(domain, typesCopy, value);
        };
    }

    window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    window.ethereum.on("accountsChanged", handleAccountsChanged);

  } catch (err) { 
      console.error(err);
      if (err.code !== 4001) { 
          alert("Connect xətası: " + err.message); 
      }
  }
}

disconnectBtn.onclick = handleDisconnect;
connectBtn.onclick = connectWallet;

// Cüzdan əlaqəsini bərpa edən funksiya
async function ensureWalletConnection() {
    if (signer && seaport) return true;
    if (window.ethereum && window.ethereum.selectedAddress) {
        console.log("Signer itmişdi, bərpa edilir...");
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum, "any");
            signer = provider.getSigner();
            seaport = new Seaport(signer, { 
                overrides: { contractAddress: SEAPORT_ADDRESS, defaultConduitKey: ZERO_BYTES32 } 
            });
             if (signer && !signer.signTypedData) {
                signer.signTypedData = async (domain, types, value) => {
                    const typesCopy = { ...types }; delete typesCopy.EIP712Domain; 
                    return await signer._signTypedData(domain, typesCopy, value);
                };
            }
            return true;
        } catch (e) {
            console.error("Bərpa xətası:", e);
            return false;
        }
    }
    return false;
}

// ==========================================
// 4. DATA YÜKLƏMƏ & SORTING
// ==========================================

async function fetchStats() {
    if (!totalVolEl || !dayVolEl) return;
    try {
        const res = await fetch(`${BACKEND_URL}/api/stats`);
        const data = await res.json();
        if(data.success) {
            const fmt = (val) => parseFloat(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            totalVolEl.innerText = `${fmt(data.totalVolume)} APE`;
            dayVolEl.innerText = `${fmt(data.dayVolume)} APE`;
        }
    } catch(e) { console.error("Stats Error:", e); }
}

async function loadNFTs() {
  selectedTokens.clear();
  updateBulkUI();
  fetchStats();

  try {
    const res = await fetch(`${BACKEND_URL}/api/nfts`);
    const data = await res.json();
    let rawList = data.nfts || [];

    allNFTs = rawList.sort((a, b) => {
        const priceA = parseFloat(a.price) || 0;
        const priceB = parseFloat(b.price) || 0;
        const idA = parseInt(a.tokenid);
        const idB = parseInt(b.tokenid);

        if (priceA > 0 && priceB === 0) return -1; 
        if (priceA === 0 && priceB > 0) return 1;  
        if (priceA > 0 && priceB > 0) return priceA - priceB;
        return idA - idB;
    });

    renderNFTs(allNFTs);
  } catch (err) {
    console.error(err);
    marketplaceDiv.innerHTML = "<p style='color:red; text-align:center; grid-column:1/-1;'>Yüklənmə xətası.</p>";
  }
}

// ==========================================
// 5. RENDER & HTML GENERATION
// ==========================================

function createCardElement(nft) {
    const tokenidRaw = (nft.tokenid !== undefined && nft.tokenid !== null) ? nft.tokenid : nft.tokenId;
    if (tokenidRaw === undefined || tokenidRaw === null) return null;
    const tokenid = tokenidRaw.toString(); 

    const name = nft.name || `NFT #${tokenid}`;
    
    let displayPrice = "";
    let priceVal = 0;
    let isListed = false;

    // Hazırkı satış qiyməti
    if (nft.price && parseFloat(nft.price) > 0) {
        priceVal = parseFloat(nft.price);
        displayPrice = `${priceVal} APE`;
        isListed = true;
    }

    // --- YENİ HİSSƏ: Son satış qiyməti ---
    let lastSoldHTML = "";
    if (!isListed && nft.last_sale_price && parseFloat(nft.last_sale_price) > 0) {
        lastSoldHTML = `<div style="font-size:12px; color:#888; margin-top:4px; font-weight:500;">Son satış: ${parseFloat(nft.last_sale_price).toLocaleString()} APE</div>`;
    }
    // ------------------------------------

    let canManage = false;
    let canSelect = false;

    if (userAddress) {
        if (nft.seller_address && nft.seller_address.toLowerCase() === userAddress) {
            canManage = true; 
            canSelect = true;
        }
        else if (nft.buyer_address && nft.buyer_address.toLowerCase() === userAddress) {
            canManage = true;
            canSelect = true;
        } else {
            if(isListed) canSelect = true;
        }
    }

    const card = document.createElement("div");
    card.className = "nft-card";
    card.id = `card-${tokenid}`; 
    card.style.height = "auto";

    let checkboxHTML = canSelect ? `<input type="checkbox" class="select-box" data-id="${tokenid}">` : "";

    let actionsHTML = "";
    if (isListed) {
        if (canManage) {
            actionsHTML = `
                <div style="font-size:13px; color:#10b981; margin-bottom:5px; font-weight:600;">Sizin Listiniz: ${displayPrice}</div>
                <input type="number" placeholder="Yeni Qiymət" class="mini-input price-input" step="0.001">
                <button class="action-btn btn-list update-btn" style="margin-top:8px;">Yenilə</button>
            `;
        } else {
            actionsHTML = `<button class="action-btn btn-buy buy-btn">Satın Al ${displayPrice}</button>`;
        }
    } else {
        if (canManage) {
            actionsHTML = `
                ${lastSoldHTML}
                <input type="number" placeholder="Qiymət (APE)" class="mini-input price-input" step="0.001">
                <button class="action-btn btn-list list-btn" style="margin-top:8px;">Satışa Qoy</button>
            `;
        } else {
             actionsHTML = `
                ${lastSoldHTML}
                <div style="font-size:13px; color:#999; text-align:center; padding:10px;">Satışda deyil</div>
             `;
        }
    }

    card.innerHTML = `
        ${checkboxHTML}
        <div class="card-content">
            <div class="card-title" title="${name}">${name}</div>
            <div class="card-details">
                 ${displayPrice && !canManage ? `<div class="price-val">${displayPrice}</div>` : `<div style="height:24px"></div>`}
            </div>
            <div class="card-actions" style="flex-direction:column; gap:4px;">
                ${actionsHTML}
            </div>
        </div>
    `;

    const chk = card.querySelector(".select-box");
    if (chk) {
        chk.checked = selectedTokens.has(tokenid);
        chk.onchange = (e) => {
            if (e.target.checked) selectedTokens.add(tokenid);
            else selectedTokens.delete(tokenid);
            updateBulkUI();
        };
    }

    if (isListed && !canManage) {
        const btn = card.querySelector(".buy-btn");
        if(btn) btn.onclick = async () => await buyNFT(nft);
    } else {
        const btn = card.querySelector(".list-btn") || card.querySelector(".update-btn");
        if(btn) btn.onclick = async () => {
            const priceInput = card.querySelector(".price-input");
            let inp = priceInput.value;
            if(inp) inp = inp.trim();
            if(!inp || isNaN(inp) || parseFloat(inp) <= 0) return notify("Düzgün qiymət yazın!");
            await listNFT(tokenid, inp);
        };
    }

    return card;
}

function renderNFTs(list) {
    marketplaceDiv.innerHTML = "";
    if (itemsCountEl) itemsCountEl.innerText = list.length;

    if (list.length === 0) {
        marketplaceDiv.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #94a3b8; display:flex; flex-direction:column; align-items:center; gap:20px;">
                <div style="font-size: 60px; opacity:0.5;">👻</div>
                <div>
                    <h3 style="margin:0; font-size:20px; color:#64748b;">Heç bir NFT tapılmadı</h3>
                </div>
            </div>
        `;
        return;
    }

    list.forEach((nft, index) => {
        const cardElement = createCardElement(nft);
        if(cardElement) {
            const delay = Math.min(index * 0.05, 1.0); 
            cardElement.style.animationDelay = `${delay}s`;
            marketplaceDiv.appendChild(cardElement);
        }
    });
}

function refreshSingleCard(tokenid) {
    const nftData = allNFTs.find(n => n.tokenid == tokenid);
    if (!nftData) return;
    const oldCard = document.getElementById(`card-${tokenid}`);
    const newCard = createCardElement(nftData);
    if (newCard) newCard.style.animation = "none"; 
    if (oldCard && newCard) oldCard.replaceWith(newCard); 
    else if (!oldCard && newCard) marketplaceDiv.appendChild(newCard); 
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allNFTs.filter(nft => {
            const name = (nft.name || "").toLowerCase();
            const tid = (nft.tokenid ?? nft.tokenId).toString();
            return name.includes(query) || tid.includes(query);
        });
        renderNFTs(filtered);
    });
}

// ==========================================
// 7. TOPLU UI & LOGIC
// ==========================================

function updateBulkUI() {
    if (selectedTokens.size > 0) {
        bulkBar.classList.add("active");
        bulkCount.textContent = `${selectedTokens.size} NFT seçildi`;

        let totalCost = 0;
        let allListed = true;
        let validSelection = false;

        selectedTokens.forEach(tid => {
            const nft = allNFTs.find(n => n.tokenid == tid);
            if (nft) {
                validSelection = true;
                const price = parseFloat(nft.price || 0);
                const isOwner = (nft.seller_address && nft.seller_address.toLowerCase() === userAddress);
                
                if (price > 0 && !isOwner) {
                    totalCost += price;
                } else {
                    allListed = false; 
                }
            }
        });

        if (allListed && validSelection && totalCost > 0) {
            bulkListActions.style.display = "none";
            bulkBuyBtn.style.display = "inline-block";
            bulkTotalPriceEl.innerText = totalCost.toFixed(3);
        } else {
            bulkListActions.style.display = "flex";
            bulkBuyBtn.style.display = "none";
        }
    } else {
        bulkBar.classList.remove("active");
    }
}

window.cancelBulk = () => {
    selectedTokens.clear();
    document.querySelectorAll(".select-box").forEach(b => b.checked = false);
    updateBulkUI();
};

if(bulkListBtn) {
    bulkListBtn.onclick = async () => {
        let priceVal = bulkPriceInp.value;
        if(priceVal) priceVal = priceVal.trim();
        if (!priceVal || isNaN(priceVal) || parseFloat(priceVal) <= 0) return alert("Qiymət yazın.");
        await bulkListNFTs(Array.from(selectedTokens), priceVal);
    };
}

if(bulkBuyBtn) {
    bulkBuyBtn.onclick = async () => {
        await bulkBuyNFTs(Array.from(selectedTokens));
    };
}

// ==========================================
// 8. LISTING FUNCTIONS
// ==========================================

async function listNFT(tokenid, priceInEth) {
  if (tokenid === undefined || tokenid === null) return alert("Token ID xətası.");
  await bulkListNFTs([tokenid], priceInEth);
}

async function bulkListNFTs(tokenIds, priceInEth) {
    await ensureWalletConnection();
    if (!signer || !seaport) return alert("Cüzdan qoşulmayıb! Zəhmət olmasa 'Connect Wallet' düyməsinə basın.");
    
    let priceWeiString;
    try {
        priceWeiString = ethers.utils.parseEther(String(priceInEth).trim()).toString();
    } catch (e) { return alert(`Qiymət xətası: ${e.message}`); }

    const cleanTokenIds = tokenIds.map(t => String(t));
    const seller = await signer.getAddress();

    try {
        const nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, 
            ["function isApprovedForAll(address,address) view returns(bool)", "function setApprovalForAll(address,bool)"], signer);
        
        if (!(await nftContract.isApprovedForAll(seller, SEAPORT_ADDRESS))) {
            notify("Satış kontraktı təsdiq olunur...");
            const tx = await nftContract.setApprovalForAll(SEAPORT_ADDRESS, true);
            await tx.wait();
            notify("Təsdiqləndi!");
        }
    } catch (e) { return alert("Approve xətası: " + e.message); }

    notify(`${cleanTokenIds.length} NFT orderi imzalanır...`);

    try {
        const startTimeVal = Math.floor(Date.now()/1000).toString(); 
        const endTimeVal = (Math.floor(Date.now()/1000) + 15552000).toString(); 

        const orderInputs = cleanTokenIds.map(tokenStr => {
            return {
                orderType: OrderType.FULL_OPEN, zone: ZERO_ADDRESS, zoneHash: ZERO_BYTES32, conduitKey: ZERO_BYTES32, 
                offer: [{ itemType: ItemType.ERC721, token: NFT_CONTRACT_ADDRESS, identifier: tokenStr, amount: "1" }],
                consideration: [{ itemType: ItemType.NATIVE, token: ZERO_ADDRESS, identifier: "0", amount: priceWeiString, recipient: seller }],
                startTime: startTimeVal, endTime: endTimeVal,
            };
        });

        notify("Zəhmət olmasa cüzdanda imzalayın...");
        const { executeAllActions } = await seaport.createBulkOrders(orderInputs, seller);
        const signedOrders = await executeAllActions(); 

        notify("İmza alındı! UI yenilənir...");

        for (const order of signedOrders) {
            const offerItem = order.parameters.offer[0];
            const tokenStr = offerItem.identifierOrCriteria;

            await fetch(`${BACKEND_URL}/api/order`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tokenid: tokenStr,
                    price: String(priceInEth),
                    seller_address: seller,
                    seaport_order: orderToJsonSafe(order),
                    order_hash: seaport.getOrderHash(order.parameters),
                    status: "active"
                }),
            });

            const nftIndex = allNFTs.findIndex(n => n.tokenid == tokenStr);
            if (nftIndex !== -1) {
                allNFTs[nftIndex].price = priceInEth;
                allNFTs[nftIndex].seller_address = seller.toLowerCase();
                allNFTs[nftIndex].seaport_order = orderToJsonSafe(order); 
                allNFTs[nftIndex].buyer_address = null;
            }
            refreshSingleCard(tokenStr);
        }
        
        cancelBulk();
        notify("Uğurla listələndi!");

    } catch (err) {
        console.error("List Error:", err);
        alert("Satış xətası: " + (err.message || err));
    }
}

// ==========================================
// 9. BUY FUNCTIONS (FIXED FOR BULK)
// ==========================================

async function buyNFT(nftRecord) {
    selectedTokens.clear();
    selectedTokens.add(nftRecord.tokenid.toString());
    await bulkBuyNFTs([nftRecord.tokenid.toString()]);
}

async function bulkBuyNFTs(tokenIds) {
    // 1. Cüzdanı yoxla
    await ensureWalletConnection();
    if (!signer || !seaport) return alert("Cüzdan qoşulmayıb! Zəhmət olmasa 'Connect Wallet' düyməsinə basın.");
    
    const buyerAddress = await signer.getAddress();
    const fulfillOrderDetails = [];

    // 2. Orderləri hazırla
    for (const tid of tokenIds) {
        const nftRecord = allNFTs.find(n => n.tokenid == tid);
        // Order yoxdursa keç
        if (!nftRecord || !nftRecord.seaport_order) continue;

        // Öz malını ala bilməzsən
        if (nftRecord.seller_address && nftRecord.seller_address.toLowerCase() === buyerAddress.toLowerCase()) {
            return alert(`NFT #${tid} sizin özünüzə aiddir, onu ala bilməzsiniz!`);
        }

        let rawOrder = nftRecord.seaport_order;
        if (typeof rawOrder === "string") { try{ rawOrder = JSON.parse(rawOrder); }catch(e){} }
        
        const cleanOrd = cleanOrder(rawOrder);
        if (cleanOrd) {
            fulfillOrderDetails.push({ order: cleanOrd });
        }
    }

    if (fulfillOrderDetails.length === 0) return alert("Alınacaq uyğun order tapılmadı.");

    notify(`${fulfillOrderDetails.length} NFT üçün toplu alış hazırlanır...`);

    try {
        // 3. Seaport vasitəsilə tranzaksiyanın qurulması (fulfillOrders)
        const { actions } = await seaport.fulfillOrders({
            fulfillOrderDetails: fulfillOrderDetails,
            accountAddress: buyerAddress,
            conduitKey: ZERO_BYTES32
        });

        const txRequest = await actions[0].transactionMethods.buildTransaction();

        // 4. Value və Gas-ın dəqiq təyin edilməsi
        // Əl ilə toplamaq əvəzinə, Seaport-un hesabladığı dəyəri götürürük
        const finalValue = txRequest.value ? ethers.BigNumber.from(txRequest.value) : ethers.BigNumber.from(0);

        notify("Qaz limiti hesablanır...");

        let estimatedGas;
        try {
            // Blokçeyndən bu əməliyyat üçün dəqiq qaz miqdarını soruşuruq
            estimatedGas = await signer.estimateGas({
                to: txRequest.to,
                data: txRequest.data,
                value: finalValue
            });
            // Xəta olmasın deyə üzərinə 20% ehtiyat gəlirik
            estimatedGas = estimatedGas.mul(120).div(100); 
        } catch (gasError) {
            console.error("Gas Estimate Error:", gasError);
            // Əgər estimate alınmasa, fallback (hər item üçün 300k)
            estimatedGas = ethers.BigNumber.from(300000).mul(fulfillOrderDetails.length);
        }

        notify("Metamask-da təsdiqləyin...");
        
        // 5. Tranzaksiyanın göndərilməsi
        const tx = await signer.sendTransaction({
            to: txRequest.to, 
            data: txRequest.data, 
            value: finalValue, 
            gasLimit: estimatedGas 
        });

        notify("Blokçeyndə təsdiqlənir...");
        await tx.wait();

        notify("Baza yenilənir...");
        
        // 6. Uğurlu olduqdan sonra lokal yenilənmə (Last Sale Logic)
        for (const item of fulfillOrderDetails) {
            const tokenIdentifier = item.order.parameters.offer[0].identifierOrCriteria;
            const nftData = allNFTs.find(n => n.tokenid == tokenIdentifier);
            
            if (nftData) {
                 await fetch(`${BACKEND_URL}/api/buy`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        tokenid: tokenIdentifier, 
                        order_hash: nftData.order_hash, 
                        buyer_address: buyerAddress,
                        price: nftData.price, 
                        seller: nftData.seller_address 
                    }),
                });
                
                const idx = allNFTs.findIndex(n => n.tokenid == tokenIdentifier);
                if (idx !== -1) {
                    // --- YENİ: Son satış qiymətini yadda saxla ---
                    allNFTs[idx].last_sale_price = allNFTs[idx].price;
                    // ---------------------------------------------
                    allNFTs[idx].price = 0;
                    allNFTs[idx].seller_address = null;
                    allNFTs[idx].buyer_address = buyerAddress.toLowerCase();
                    allNFTs[idx].seaport_order = null;
                }
                refreshSingleCard(tokenIdentifier);
            }
        }
        
        cancelBulk();
        fetchStats();
        notify("Toplu alış uğurlu oldu!");

    } catch (err) {
        console.error("Bulk Buy Error:", err);
        if (err.message && (err.message.includes("insufficient funds") || err.code === "INSUFFICIENT_FUNDS")) {
             alert("Balansınızda kifayət qədər APE yoxdur (Qiymət + Gas).");
        } 
        else if (err.data && err.data.message && err.data.message.includes("execution reverted")) {
             alert("Xəta: Seçdiyiniz NFT-lərdən biri artıq satılıb və ya qiyməti dəyişib.");
        }
        else {
             alert("Alış xətası: " + (err.message || err));
        }
    }
}

// Initial Load
loadNFTs();
window.loadNFTs = loadNFTs;
