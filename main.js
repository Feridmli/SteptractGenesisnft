import { Buffer } from "buffer";
window.Buffer = window.Buffer || Buffer;

import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ==========================================
// SABİTLƏR (CONSTANTS)
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
// KÖMƏKÇİ FUNKSİYALAR
// ==========================================

function notify(msg, timeout = 3000) {
  if (!noticeDiv) return;
  noticeDiv.textContent = msg;
  if (timeout) setTimeout(() => { if (noticeDiv.textContent === msg) noticeDiv.textContent = ""; }, timeout);
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
// CÜZDAN QOŞULMASI
// ==========================================

function handleDisconnect() {
  provider = null;
  signer = null;
  seaport = null;
  userAddress = null;

  connectBtn.style.display = "inline-block";
  disconnectBtn.style.display = "none";
  addrSpan.textContent = "";
  
  // Reset selection
  cancelBulk();
  renderNFTs(allNFTs); 
  notify("Çıxış edildi");
}

async function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    handleDisconnect();
  } else {
    userAddress = accounts[0].toLowerCase();
    
    if (provider) {
        signer = provider.getSigner();
        seaport = new Seaport(signer, { 
            overrides: { contractAddress: SEAPORT_ADDRESS, defaultConduitKey: ZERO_BYTES32 } 
        });
    }

    addrSpan.textContent = `Wallet: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    notify("Hesab dəyişildi!");
    
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    
    cancelBulk();
    renderNFTs(allNFTs);
  }
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
    await handleAccountsChanged(accounts);

    if (signer && !signer.signTypedData) {
        signer.signTypedData = async (domain, types, value) => {
            const typesCopy = { ...types }; delete typesCopy.EIP712Domain; 
            return await signer._signTypedData(domain, typesCopy, value);
        };
    }
    
    notify("Cüzdan qoşuldu!");

    window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    window.ethereum.on("accountsChanged", handleAccountsChanged);

  } catch (err) { 
      console.error(err);
      alert("Connect xətası: " + err.message); 
  }
}

disconnectBtn.onclick = handleDisconnect;
connectBtn.onclick = connectWallet;

// ==========================================
// DATA YÜKLƏMƏ & SORTING
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
  marketplaceDiv.innerHTML = "<p style='color:black; width:100%; text-align:center;'>NFT-lər yüklənir...</p>";
  selectedTokens.clear();
  updateBulkUI();
  fetchStats();

  try {
    const res = await fetch(`${BACKEND_URL}/api/nfts`);
    const data = await res.json();
    let rawList = data.nfts || [];

    // Sorting: Listed First -> Price Asc -> ID Asc
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
    marketplaceDiv.innerHTML = "<p style='color:red; text-align:center;'>Yüklənmə xətası.</p>";
  }
}

// ==========================================
// RENDER & HTML GENERATION
// ==========================================

function createCardElement(nft) {
    const tokenidRaw = (nft.tokenid !== undefined && nft.tokenid !== null) ? nft.tokenid : nft.tokenId;
    if (tokenidRaw === undefined || tokenidRaw === null) return null;
    const tokenid = tokenidRaw.toString(); 

    const name = nft.name || `NFT #${tokenid}`;
    
    let displayPrice = "";
    let priceVal = 0;
    let isListed = false;

    if (nft.price && parseFloat(nft.price) > 0) {
        priceVal = parseFloat(nft.price);
        displayPrice = `${priceVal} APE`;
        isListed = true;
    }

    let canManage = false;
    let canSelect = false;

    if (userAddress) {
        if (nft.seller_address && nft.seller_address.toLowerCase() === userAddress) {
            canManage = true; 
            canSelect = true; // Öz malını seçib qiymətini dəyişə bilər
        }
        else if (nft.buyer_address && nft.buyer_address.toLowerCase() === userAddress) {
            canManage = true;
            canSelect = true; // Öz malını seçib listələyə bilər
        } else {
            // Başqasının malıdır
            if(isListed) canSelect = true; // Satlıqdırsa seçib ala bilər
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
                <div style="font-size:12px; color:green; margin-bottom:5px;">Listed: ${displayPrice}</div>
                <input type="number" placeholder="Update Price" class="mini-input price-input" step="0.001">
                <button class="action-btn btn-list update-btn">Update</button>
            `;
        } else {
            actionsHTML = `<button class="action-btn btn-buy buy-btn">Buy ${displayPrice}</button>`;
        }
    } else {
        if (canManage) {
            actionsHTML = `
                <input type="number" placeholder="Price" class="mini-input price-input" step="0.001">
                <button class="action-btn btn-list list-btn">List</button>
            `;
        }
    }

    card.innerHTML = `
        ${checkboxHTML}
        <div class="card-content">
            <div class="card-title">${name}</div>
            <div class="card-details">
                 ${displayPrice && !canManage ? `<div class="price-val">${displayPrice}</div>` : `<div style="height:24px"></div>`}
            </div>
            <div class="card-actions">
                ${actionsHTML}
            </div>
        </div>
    `;

    // Event Listeners
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
        marketplaceDiv.innerHTML = "<p style='color:black; width:100%; text-align:center;'>NFT tapılmadı.</p>";
        return;
    }

    list.forEach(nft => {
        const cardElement = createCardElement(nft);
        if(cardElement) marketplaceDiv.appendChild(cardElement);
    });
}

function refreshSingleCard(tokenid) {
    const nftData = allNFTs.find(n => n.tokenid == tokenid);
    if (!nftData) return;
    const oldCard = document.getElementById(`card-${tokenid}`);
    const newCard = createCardElement(nftData);
    if (oldCard && newCard) oldCard.replaceWith(newCard); 
    else if (!oldCard && newCard) marketplaceDiv.appendChild(newCard); 
}

// ==========================================
// SEARCH
// ==========================================
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
// TOPLU UI & LOGIC (BUY + LIST)
// ==========================================

function updateBulkUI() {
    if (selectedTokens.size > 0) {
        bulkBar.classList.add("active");
        bulkCount.textContent = `${selectedTokens.size} NFT seçildi`;

        let totalCost = 0;
        let allListed = true;
        let allUnlisted = true;

        selectedTokens.forEach(tid => {
            const nft = allNFTs.find(n => n.tokenid == tid);
            if (nft) {
                const price = parseFloat(nft.price || 0);
                // User check: Əgər user öz malını seçibsə, onu "buy" edə bilməz, ona görə listed sayılmır kontekstində
                const isOwner = (nft.seller_address && nft.seller_address.toLowerCase() === userAddress);
                
                if (price > 0 && !isOwner) {
                    totalCost += price;
                    allUnlisted = false;
                } else {
                    // Ya qiyməti yoxdur, ya da öz malımızdır (satıla bilməz bizə)
                    allListed = false; 
                }
            }
        });

        if (allListed && selectedTokens.size > 0) {
            // Hamısı satlıqdır və başqasınındır -> BUY MODE
            bulkListActions.style.display = "none";
            bulkBuyBtn.style.display = "inline-block";
            bulkTotalPriceEl.innerText = totalCost.toFixed(3);
        } else {
            // Əks halda -> LIST MODE (Default)
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

// Bulk List Button
if(bulkListBtn) {
    bulkListBtn.onclick = async () => {
        let priceVal = bulkPriceInp.value;
        if(priceVal) priceVal = priceVal.trim();
        if (!priceVal || isNaN(priceVal) || parseFloat(priceVal) <= 0) return alert("Qiymət yazın.");
        await bulkListNFTs(Array.from(selectedTokens), priceVal);
    };
}

// Bulk Buy Button
if(bulkBuyBtn) {
    bulkBuyBtn.onclick = async () => {
        await bulkBuyNFTs(Array.from(selectedTokens));
    };
}

// ==========================================
// LISTING FUNCTIONS
// ==========================================

async function listNFT(tokenid, priceInEth) {
  if (tokenid === undefined || tokenid === null) return alert("Token ID xətası.");
  await bulkListNFTs([tokenid], priceInEth);
}

async function bulkListNFTs(tokenIds, priceInEth) {
    if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
    
    let priceWeiString;
    try {
        priceWeiString = ethers.utils.parseEther(String(priceInEth).trim()).toString();
    } catch (e) { return alert(`Qiymət xətası: ${e.message}`); }

    const cleanTokenIds = tokenIds.map(t => String(t));
    const seller = await signer.getAddress();

    // Check Approval
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
        renderNFTs(allNFTs); // Re-render to sort properly
        notify("Uğurla listələndi!");

    } catch (err) {
        console.error("List Error:", err);
        alert("Satış xətası: " + (err.message || err));
    }
}

// ==========================================
// BUY FUNCTIONS (SINGLE & BULK)
// ==========================================

async function buyNFT(nftRecord) {
    // Single buy wrapper for bulk logic
    selectedTokens.clear();
    selectedTokens.add(nftRecord.tokenid.toString());
    await bulkBuyNFTs([nftRecord.tokenid.toString()]);
}

async function bulkBuyNFTs(tokenIds) {
    if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
    
    const buyerAddress = await signer.getAddress();
    const fulfillOrderDetails = [];
    let totalValue = ethers.BigNumber.from(0);

    for (const tid of tokenIds) {
        const nftRecord = allNFTs.find(n => n.tokenid == tid);
        if (!nftRecord || !nftRecord.seaport_order) continue;

        if (nftRecord.seller_address && nftRecord.seller_address.toLowerCase() === buyerAddress.toLowerCase()) {
            return alert(`NFT #${tid} sizin özünüzə aiddir, onu ala bilməzsiniz!`);
        }

        let rawOrder = nftRecord.seaport_order;
        if (typeof rawOrder === "string") { try{ rawOrder = JSON.parse(rawOrder); }catch(e){} }
        
        const cleanOrd = cleanOrder(rawOrder);
        if (cleanOrd) {
            fulfillOrderDetails.push({ order: cleanOrd });
            cleanOrd.parameters.consideration.forEach(c => {
                 if (Number(c.itemType) === 0) totalValue = totalValue.add(ethers.BigNumber.from(c.startAmount));
            });
        }
    }

    if (fulfillOrderDetails.length === 0) return alert("Alınacaq uyğun order tapılmadı.");

    notify(`${fulfillOrderDetails.length} NFT üçün toplu alış hazırlanır...`);

    try {
        const { actions } = await seaport.fulfillOrders({
            fulfillOrderDetails: fulfillOrderDetails,
            accountAddress: buyerAddress,
            conduitKey: ZERO_BYTES32
        });

        const txRequest = await actions[0].transactionMethods.buildTransaction();

        if (txRequest.value) {
            const valBN = ethers.BigNumber.from(txRequest.value);
            if (valBN.gt(totalValue)) totalValue = valBN;
        }

        notify("Metamask-da təsdiqləyin...");
        const tx = await signer.sendTransaction({
            to: txRequest.to, data: txRequest.data, value: totalValue, 
            gasLimit: 300000 * fulfillOrderDetails.length 
        });

        notify("Blokçeyndə təsdiqlənir...");
        await tx.wait();

        notify("Baza yenilənir...");
        
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
        if (err.message && err.message.includes("insufficient funds")) alert("Balansınızda kifayət qədər APE yoxdur.");
        else alert("Alış xətası: " + (err.message || err));
    }
}

// Initial Load
loadNFTs();
window.loadNFTs = loadNFTs;
