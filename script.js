// ========== CONFIG ==========

// Shipping config defaults (front-end; overwritten by admin settings on cart page)
let SHIPPING_FLAT_RATE = 6.95;       // example USPS-ish flat rate for ~3 shirts
let FREE_SHIPPING_THRESHOLD = 75;    // free shipping when subtotal >= $75

// Global products array (filled from /products)
let products = [];

// ===== STOCK HELPERS =====

// Return qty for a specific color/size variant (currently unused but kept)
function getVariantStock(product, color, size) {
  if (!product.variants || !product.variants.length) return 0;

  const variant = product.variants.find(
    (v) => v.color === color && v.size === size
  );

  return variant ? Number(variant.qty) || 0 : 0;
}

// Load announcement banner + shop splash from admin config
async function loadAnnouncementBanner() {
  const bar = document.getElementById("announcement-bar");
  const textEl = document.getElementById("announcement-text");

  const splashSection = document.getElementById("shop-splash");
  const splashMessageEl = document.getElementById("shop-splash-message");

  // If neither banner nor splash exist, nothing to do
  if (!bar && !splashSection) return;

  try {
    const res = await fetch(`${API_BASE}/admin/config`);
    if (!res.ok) throw new Error("Failed to load admin config");

    const data = await res.json();

    // ----- Announcement bar -----
    if (bar && textEl) {
      const bannerText = (data.bannerText || "").trim();
      const visible = !!data.bannerVisible;

      if (!visible || !bannerText) {
        bar.style.display = "none";
      } else {
        textEl.textContent = bannerText;
        bar.style.display = "";
      }
    }

    // ----- Shop splash / popup (online shop closed) -----
    if (splashSection && splashMessageEl) {
      const popupEnabled = !!data.popupEnabled;
      const popupMode = data.popupMode || "none"; // "none" | "event" | "inventory" | "custom"
      const popupCustomText = (data.popupCustomText || "").trim();

      let showSplash = false;
      let message = "";

      if (popupEnabled) {
        switch (popupMode) {
          case "event":
            showSplash = true;
            message =
              "Our online shop is temporarily closed while we’re at an in-person event. We’ll reopen the shop once we’re back and inventory is updated. Thanks for your patience!";
            break;
          case "inventory":
            showSplash = true;
            message =
              "We’re currently updating inventory. The online shop will reopen shortly once everything is synced. Please check back soon!";
            break;
          case "custom":
            if (popupCustomText) {
              showSplash = true;
              message = popupCustomText;
            }
            break;
          default:
            break;
        }
      }

      if (showSplash) {
        splashMessageEl.textContent = message;
        splashSection.classList.remove("hidden");
      } else {
        splashSection.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("Error loading banner/splash config:", err);
  }
}

// Does this product have ANY stock at all? (currently unused but kept)
function productHasAnyStock(product) {
  if (!product.variants || !product.variants.length) return true; // no variants = treat as available
  return product.variants.some((v) => Number(v.qty) > 0);
}

// Active filters (shop)
let activeTypeFilter = "all"; // "all", "T-Shirts", "Hoodies", "Sweatshirts", etc.
let activeAudienceFilter = "all"; // "all", "Men/Unisex", "Women", "Kids"

// Active filters (kiosk)
let kioskTypeFilter = "all";
let kioskAudienceFilter = "all";

// ========== MASTER SIZE & COLOR LISTS (CAPABILITY) ==========
const MASTER_SIZES = [
  "NB",
  "0-3M",
  "3-6M",
  "6-9M",
  "6-12M",
  "12M",
  "18M",
  "24M",
  "2T",
  "3T",
  "4T",
  "5T",
  "YS",
  "YM",
  "YL",
  "YXL",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
];

const MASTER_COLORS = [
  "Beige",
  "Black",
  "Blue",
  "Dark Blue",
  "Dark Green",
  "Dark Pink",
  "Green",
  "Grey",
  "Hot Pink",
  "Light Blue",
  "Light Green",
  "Light Pink",
  "Light Purple",
  "Orange",
  "Pink",
  "Purple",
  "Red",
  "White",
  "Yellow",
];

// ========== CART PERSISTENCE ==========
const CART_KEY = "spc_cart_v1";

function loadCartFromStorage() {
  try {
    const stored = localStorage.getItem(CART_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    // ignore
  }
}

// Global cart state
let cart = loadCartFromStorage();

// Common cart UI elements (may be null on some pages)
const cartCountEl = document.getElementById("cart-count");
const cartTotalEl = document.getElementById("cart-total");
const cartDetailsEl = document.getElementById("cart-details");

// Optional extras for shipping + grand total
const cartShippingEl = document.getElementById("cart-shipping");       // span/div to show shipping
const cartGrandTotalEl = document.getElementById("cart-grand-total"); // span/div to show subtotal + shipping
const freeShipBannerEl = document.getElementById("free-shipping-banner"); // little banner text on cart page

// Optional checkout customer fields (cart page)
const checkoutNameInput = document.getElementById("checkout-name");
const checkoutEmailInput = document.getElementById("checkout-email");
const checkoutPhoneInput = document.getElementById("checkout-phone");
const checkoutAddress1Input = document.getElementById("checkout-address1");
const checkoutAddress2Input = document.getElementById("checkout-address2");
const checkoutCityInput = document.getElementById("checkout-city");
const checkoutStateInput = document.getElementById("checkout-state");
const checkoutZipInput = document.getElementById("checkout-zip");

// ========== SHIPPING HELPER ==========
function computeShipping(subtotal) {
  if (subtotal <= 0) return 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_FLAT_RATE;
}

// ========== CHECKOUT HANDLER ==========
async function handleCheckoutClick() {
  if (!cart || !cart.length) {
    alert("Your cart is empty.");
    return;
  }

  // Basic customer info (name + email required, address optional for now)
  const customer = {
    name: checkoutNameInput ? checkoutNameInput.value.trim() : "",
    email: checkoutEmailInput ? checkoutEmailInput.value.trim() : "",
    phone: checkoutPhoneInput ? checkoutPhoneInput.value.trim() : "",
    address1: checkoutAddress1Input ? checkoutAddress1Input.value.trim() : "",
    address2: checkoutAddress2Input ? checkoutAddress2Input.value.trim() : "",
    city: checkoutCityInput ? checkoutCityInput.value.trim() : "",
    state: checkoutStateInput ? checkoutStateInput.value.trim() : "",
    postalCode: checkoutZipInput ? checkoutZipInput.value.trim() : "",
  };

  if (!customer.name) {
    alert("Please enter your name.");
    return;
  }
  if (!customer.email) {
    alert("Please enter your email address.");
    return;
  }

  // Recompute totals here to keep in sync with backend
  const merchandiseTotal = cart.reduce(
    (sum, item) => sum + item.qty * item.price,
    0
  );
  const shippingAmount = computeShipping(merchandiseTotal);
  const shippingTotalCents = Math.round(shippingAmount * 100);

  try {
    // Convert cart into what the backend expects: price in CENTS
    const payloadCart = cart.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      color: item.color,
      size: item.size,
      // frontend price is in dollars
      price: Math.round(item.price * 100), // cents
      quantity: item.qty || 1,
      squareVariationId: item.squareVariationId || null,
    }));

    const body = {
      cart: payloadCart,
      customer,
      shippingTotalCents,
    };

    console.log("FRONTEND raw cart:", cart);
    console.log("FRONTEND payload body:", body);

    const res = await fetch(`${API_BASE}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Checkout error status:", res.status);
      const err = await res.json().catch(() => ({}));
      alert(
        "There was a problem starting checkout: " +
          (err.error || "Unknown error")
      );
      return;
    }

    const data = await res.json();

    if (!data.checkoutUrl) {
      alert("Checkout URL missing from server response.");
      return;
    }

    // Send the customer to Square's checkout page
    window.location.href = data.checkoutUrl;
  } catch (error) {
    console.error("Checkout failed:", error);
    alert("Something went wrong starting checkout. Please try again.");
  }
}

// ========== IMAGE MODAL (SHARED) ==========
const imageModal = document.getElementById("image-modal");
const imageModalImg = imageModal
  ? document.getElementById("image-modal-img")
  : null;
const imageModalCaption = imageModal
  ? document.getElementById("image-modal-caption")
  : null;
const imageModalCloseBtn = imageModal
  ? document.querySelector(".image-modal-close")
  : null;

function openImageModal(src, caption) {
  if (imageModal && imageModalImg && imageModalCaption) {
    imageModalImg.src = src;
    imageModalCaption.textContent = caption || "";
    imageModal.classList.remove("hidden");
  } else {
    window.open(src, "_blank");
  }
}

function initImageModalHandlers() {
  if (!imageModal) return;
  if (imageModalCloseBtn) {
    imageModalCloseBtn.addEventListener("click", () => {
      imageModal.classList.add("hidden");
      if (imageModalImg) imageModalImg.src = "";
      if (imageModalCaption) imageModalCaption.textContent = "";
    });
  }

  imageModal.addEventListener("click", (e) => {
    if (e.target === imageModal) {
      imageModal.classList.add("hidden");
      if (imageModalImg) imageModalImg.src = "";
      if (imageModalCaption) imageModalCaption.textContent = "";
    }
  });
}

// ========== CART RENDERING ==========
function renderCartDetails() {
  if (!cartDetailsEl) return;

  if (cart.length === 0) {
    cartDetailsEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
    return;
  }

  const linesHtml = cart
    .map((item, index) => {
      const lineTotal = (item.qty * item.price).toFixed(2);
      const typeLabel =
        item.type && item.type !== "Other" ? item.type + " • " : "";
      const colorLabel = item.color ? item.color : "";
      const sizeLabel = item.size ? item.size : "";

      const imgSrc =
        item.image || "https://via.placeholder.com/80x80?text=No+Image";

      return `
        <div class="cart-line">
          <div class="cart-line-image">
            <img src="${imgSrc}" alt="${item.name}" />
          </div>
          <div class="cart-line-main">
            <div class="cart-line-name cart-name-below">${item.name}</div>
            <div class="cart-line-meta cart-meta-purple">
              ${typeLabel}${colorLabel}${
        colorLabel && sizeLabel ? " • " : ""
      }${sizeLabel}
            </div>
          </div>
          <div class="cart-line-controls">
            <button class="cart-dec" data-index="${index}">-</button>
            <span class="cart-qty">${item.qty}</span>
            <button class="cart-inc" data-index="${index}">+</button>
            <span class="cart-line-total">$${lineTotal}</span>
            <button class="cart-remove" data-index="${index}">x</button>
          </div>
        </div>
      `;
    })
    .join("");

  cartDetailsEl.innerHTML = linesHtml;

  // Wire up +/-/remove buttons
  cartDetailsEl.querySelectorAll(".cart-inc").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      cart[idx].qty += 1;
      saveCartToStorage();
      updateCartDisplay();
    });
  });

  cartDetailsEl.querySelectorAll(".cart-dec").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      cart[idx].qty -= 1;
      if (cart[idx].qty <= 0) {
        cart.splice(idx, 1);
      }
      saveCartToStorage();
      updateCartDisplay();
    });
  });

  cartDetailsEl.querySelectorAll(".cart-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      cart.splice(idx, 1);
      saveCartToStorage();
      updateCartDisplay();
    });
  });
}

function updateCartDisplay() {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = cart.reduce(
    (sum, item) => sum + item.qty * item.price,
    0
  );

  const shipping = computeShipping(totalPrice);
  const grandTotal = totalPrice + shipping;

  if (cartCountEl) cartCountEl.textContent = totalItems;
  if (cartTotalEl) cartTotalEl.textContent = totalPrice.toFixed(2);
  if (cartShippingEl) cartShippingEl.textContent = shipping.toFixed(2);
  if (cartGrandTotalEl) cartGrandTotalEl.textContent = grandTotal.toFixed(2);

  if (freeShipBannerEl) {
    if (totalPrice <= 0) {
      freeShipBannerEl.textContent =
        `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD.toFixed(2)}.`;
    } else if (totalPrice >= FREE_SHIPPING_THRESHOLD) {
      freeShipBannerEl.textContent = "You’re getting FREE shipping!";
    } else {
      const diff = FREE_SHIPPING_THRESHOLD - totalPrice;
      freeShipBannerEl.textContent =
        `Add $${diff.toFixed(2)} more for FREE shipping.`;
    }
  }

  renderCartDetails();
}

// Helper: find Square variation ID for a given product/color/size
function findSquareVariationId(product, color, size) {
  if (!Array.isArray(product.squareVariations)) return null;

  const colorLower = (color || "").toLowerCase();
  const sizeLower = (size || "").toLowerCase();

  const match = product.squareVariations.find((v) => {
    const vColor = (v.color || "").toLowerCase();
    const vSize = (v.size || "").toLowerCase();
    return vColor === colorLower && vSize === sizeLower;
  });

  return match ? match.id || null : null;
}

function addToCart(product, color, size, qty) {
  if (qty <= 0) return;

  const existing = cart.find(
    (item) =>
      item.id === product.id && item.color === color && item.size === size
  );

  if (existing) {
    existing.qty += qty;
  } else {
    const variationId = findSquareVariationId(product, color, size);

    cart.push({
      id: product.id,
      name: product.name,
      type: product.type,
      price: product.price, // dollars
      color,
      size,
      qty,
      image: product.image || null,
      squareVariationId: variationId,
    });
  }

  saveCartToStorage();
  updateCartDisplay();
}

// ========== STOCK STATUS HELPER ==========
function getStockStatus(product) {
  const inv = typeof product.inventory === "number" ? product.inventory : 0;

  if (inv <= 0) {
    return { text: "Out of stock", cssClass: "stock-out" };
  } else if (inv > 0 && inv <= 3) {
    return {
      text: `Low stock (${inv} left)`,
      cssClass: "stock-low",
    };
  } else {
    return {
      text: `${inv} in stock`,
      cssClass: "stock-in",
    };
  }
}

// Helper: pull qty out of a variation from any of several possible fields
function extractQtyFromVariation(v) {
  const fields = [
    "availableQty",
    "available_quantity",
    "inventory",
    "quantity",
    "stock",
    "qty",
    "onHand",
    "on_hand",
    "quantityOnHand",
    "quantity_on_hand",
  ];

  for (const field of fields) {
    if (v[field] !== undefined && v[field] !== null) {
      const n = Number(v[field]);
      if (!Number.isNaN(n)) {
        return n;
      }
    }
  }
  return null;
}

// ========== TRANSFORM BACKEND PRODUCTS ==========
function transformSquareProducts(squareItems) {
  if (!Array.isArray(squareItems)) return [];

  return squareItems.map((item) => {
    const name = item.name || "Unnamed Item";
    const type = item.type || "T-Shirts";
    const audience = Array.isArray(item.audience) ? item.audience : [];
    const subcategory = item.subcategory || null;
    const variations = Array.isArray(item.variations) ? item.variations : [];

    // Flags from backend
    const rawFlags = item.flags || {};
    const flags = {
      isNew: !!rawFlags.isNew,
      isFeatured: !!rawFlags.isFeatured,
      pinToTop: !!rawFlags.pinToTop,
      hideOnline: !!rawFlags.hideOnline,
      hideKiosk: !!rawFlags.hideKiosk,
      ribbonType:
        typeof rawFlags.ribbonType === "string" ? rawFlags.ribbonType : "none",
      ribbonCustomText:
        typeof rawFlags.ribbonCustomText === "string"
          ? rawFlags.ribbonCustomText
          : "",
    };

    // Decide what text should go on the ribbon
    let ribbonFromFlags = null;
    switch (flags.ribbonType) {
      case "new":
        ribbonFromFlags = "New";
        break;
      case "featured":
        ribbonFromFlags = "Featured";
        break;
      case "custom":
        ribbonFromFlags = flags.ribbonCustomText.trim() || "Featured";
        break;
      default:
        ribbonFromFlags = null;
    }

    // Backwards-compat with any older meta fields
    const meta = item.meta || {};
    const finalRibbon = ribbonFromFlags || item.ribbon || meta.ribbon || null;
    const isFeatured =
      flags.isFeatured ||
      (item.isFeatured !== undefined ? item.isFeatured : !!meta.isFeatured);
    const isNew =
      flags.isNew ||
      (item.isNew !== undefined ? item.isNew : !!meta.isNew);
    const pinToTop =
      flags.pinToTop ||
      (item.pinToTop !== undefined ? item.pinToTop : !!meta.pinToTop);

    let basePrice = 0;
    const sizeSet = new Set();
    const colorSet = new Set();
    let totalInventory = 0;

    for (const v of variations) {
      const p = typeof v.price === "number" ? v.price : Number(v.price) || 0;
      if (p > 0 && (basePrice === 0 || p < basePrice)) {
        basePrice = p;
      }
      if (v.size) sizeSet.add(v.size);
      if (v.color) colorSet.add(v.color);

      const q = extractQtyFromVariation(v);
      if (typeof q === "number" && q > 0) {
        totalInventory += q;
      }
    }

    const sizes = sizeSet.size > 0 ? Array.from(sizeSet) : ["Standard"];
    const colors = colorSet.size > 0 ? Array.from(colorSet) : ["Default"];

    // If we couldn't compute inventory from variations, fall back to item.inventory if present
    let inventory = totalInventory;
    if (inventory === 0 && typeof item.inventory === "number") {
      inventory = item.inventory;
    }

    return {
      id: item.id,
      name,
      description: item.description || "",
      type,
      audience,
      subcategory,
      image: item.image || null,
      price: basePrice,
      colors,
      sizes,
      inventory,
      squareVariations: variations,
      // meta flags for UI
      ribbon: finalRibbon,
      isFeatured,
      isNew,
      pinToTop,
      flags,
    };
  });
}

// ========== SHOP PAGE RENDERING ==========
const productGrid = document.getElementById("product-grid");
const categoryFilterContainer = document.getElementById("category-filters");
const audienceFilterContainer = document.getElementById("audience-filters");

function productMatchesFilters(p, typeFilter, audienceFilter) {
  const matchesType = typeFilter === "all" ? true : p.type === typeFilter;

  const matchesAudience =
    audienceFilter === "all"
      ? true
      : Array.isArray(p.audience) && p.audience.includes(audienceFilter);

  return matchesType && matchesAudience;
}

function renderShop() {
  if (!productGrid) return;

  productGrid.innerHTML = "";

  // Apply filters and hide-online flag
  const filtered = products.filter((p) => {
    if (p.flags && p.flags.hideOnline) return false;
    return productMatchesFilters(p, activeTypeFilter, activeAudienceFilter);
  });

  // Sort: pinToTop first, then featured, then new, then name A–Z
  const sorted = filtered.slice().sort((a, b) => {
    if (a.pinToTop !== b.pinToTop) {
      return b.pinToTop - a.pinToTop;
    }
    if (a.isFeatured !== b.isFeatured) {
      return b.isFeatured - a.isFeatured;
    }
    if (a.isNew !== b.isNew) {
      return b.isNew - a.isNew;
    }
    return a.name.localeCompare(b.name);
  });

  sorted.forEach((p) => {
    const div = document.createElement("div");
    div.className = "product";

    // Build color/size maps from variations
    const sizesByColor = {};
    if (Array.isArray(p.squareVariations) && p.squareVariations.length > 0) {
      p.squareVariations.forEach((v) => {
        const colorKey = v.color || "Default";
        if (!sizesByColor[colorKey]) {
          sizesByColor[colorKey] = new Set();
        }
        if (v.size) {
          sizesByColor[colorKey].add(v.size);
        }
      });
    }

    if (Object.keys(sizesByColor).length === 0) {
      p.colors.forEach((c) => {
        sizesByColor[c] = new Set(p.sizes);
      });
    }

    const colorOptions = p.colors
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");

    const getSizeOptionsHtml = (colorVal) => {
      const setForColor = sizesByColor[colorVal];
      let sizesArr;
      if (setForColor && setForColor.size > 0) {
        sizesArr = Array.from(setForColor);
      } else {
        sizesArr = p.sizes;
      }
      return sizesArr
        .map((s) => `<option value="${s}">${s}</option>`)
        .join("");
    };

    const initialColor = p.colors[0] || Object.keys(sizesByColor)[0] || "";
    const initialSizeOptions = getSizeOptionsHtml(initialColor);

    const stock = getStockStatus(p);
    const typeLabel = p.type === "Other" ? "" : `${p.type} • `;

    const isOutOfStock =
      typeof p.inventory === "number" ? p.inventory <= 0 : false;

    const ribbonHtml = p.ribbon
      ? `<div class="product-ribbon product-ribbon-${p.ribbon
          .toLowerCase()
          .replace(/\s+/g, "-")}">${p.ribbon}</div>`
      : "";

    div.innerHTML = `
      <div class="product-image-wrap">
        ${ribbonHtml}
        <img
          src="${
            p.image ||
            "https://via.placeholder.com/300x300?text=No+Image"
          }"
          alt="${p.name}"
          class="product-img"
        />
      </div>

      ${
        p.image
          ? `<button class="product-view-btn">View Larger</button>`
          : ""
      }

      <h3 class="product-name">${p.name}</h3>
      <p class="product-type">${typeLabel}$${p.price.toFixed(2)}</p>
      <p class="stock-status ${stock.cssClass}">${stock.text}</p>

      <label>
        Color:
        <select class="product-color" ${
          isOutOfStock ? "disabled" : ""
        }>
          ${colorOptions}
        </select>
      </label>

      <label>
        Size:
        <select class="product-size" ${
          isOutOfStock ? "disabled" : ""
        }>
          ${initialSizeOptions}
        </select>
      </label>

      <div class="product-actions">
        <label>
          Qty:
          <input
            type="number"
            min="1"
            value="1"
            class="product-qty"
            ${isOutOfStock ? "disabled" : ""}
          >
        </label>
        <button class="add-to-cart" ${
          isOutOfStock ? "disabled" : ""
        }>
          Add to Cart
        </button>
      </div>
    `;

    const colorSelect = div.querySelector(".product-color");
    const sizeSelect = div.querySelector(".product-size");
    const qtyInput = div.querySelector(".product-qty");
    const addBtn = div.querySelector(".add-to-cart");
    const viewBtn = div.querySelector(".product-view-btn");

    if (colorSelect && sizeSelect) {
      colorSelect.addEventListener("change", () => {
        const selectedColor = colorSelect.value;
        sizeSelect.innerHTML = getSizeOptionsHtml(selectedColor);
      });
    }

    if (addBtn && !isOutOfStock) {
      addBtn.addEventListener("click", () => {
        const color =
          (colorSelect && colorSelect.value) ||
          p.colors[0] ||
          "Default";
        const size =
          (sizeSelect && sizeSelect.value) ||
          p.sizes[0] ||
          "Standard";
        const qty = parseInt(qtyInput.value, 10) || 1;
        addToCart(p, color, size, qty);
      });
    }

    if (viewBtn && p.image) {
      viewBtn.addEventListener("click", () => {
        openImageModal(p.image, p.name);
      });
    }

    productGrid.appendChild(div);
  });
}

function initShop() {
  if (!productGrid) return;

  renderShop();

  if (categoryFilterContainer) {
    const buttons = categoryFilterContainer.querySelectorAll("button");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.type || btn.dataset.filter || "all";

        activeTypeFilter = filter;

        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        renderShop();
      });
    });
  }

  if (audienceFilterContainer) {
    const buttons = audienceFilterContainer.querySelectorAll("button");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const aud = btn.dataset.audience || "all";
        activeAudienceFilter = aud;

        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        renderShop();
      });
    });
  }
}

// ========== KIOSK PAGE RENDERING ==========
const kioskGrid = document.getElementById("kiosk-grid");
const kioskTypeFilterContainer = document.getElementById("kiosk-filters");
const kioskAudienceFilterContainer = document.getElementById(
  "kiosk-audience-filters"
);

// Splash + main references
const kioskMain = document.getElementById("kiosk-main");
const kioskSplash = document.getElementById("kiosk-splash");

// Optional extra kiosk filters
const kioskSearchInput = document.getElementById("kiosk-search");
const kioskSizeFilterSelect = document.getElementById("kiosk-size-filter");
const kioskColorFilterSelect = document.getElementById("kiosk-color-filter");
const kioskClearFiltersBtn = document.getElementById("kiosk-clear-filters");

// Helpers for kiosk filters
function sortByMasterOrder(values, masterList) {
  const orderMap = new Map();
  masterList.forEach((val, idx) => orderMap.set(val, idx));
  return values
    .slice()
    .sort((a, b) => {
      const ai = orderMap.has(a) ? orderMap.get(a) : 999;
      const bi = orderMap.has(b) ? orderMap.get(b) : 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
}

function getAllAvailableSizesFromProducts() {
  const set = new Set();
  products.forEach((p) => {
    (p.sizes || []).forEach((s) => {
      if (s) set.add(s);
    });
  });
  return sortByMasterOrder(Array.from(set), MASTER_SIZES);
}

function getAllAvailableColorsFromProducts() {
  const set = new Set();
  products.forEach((p) => {
    (p.colors || []).forEach((c) => {
      if (c) set.add(c);
    });
  });
  return sortByMasterOrder(Array.from(set), MASTER_COLORS);
}

function populateKioskFilterOptions() {
  if (kioskSizeFilterSelect) {
    kioskSizeFilterSelect.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "All Sizes";
    kioskSizeFilterSelect.appendChild(first);

    const sizes = getAllAvailableSizesFromProducts();
    sizes.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      kioskSizeFilterSelect.appendChild(opt);
    });
  }

  if (kioskColorFilterSelect) {
    kioskColorFilterSelect.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "All Colors";
    kioskColorFilterSelect.appendChild(first);

    const colors = getAllAvailableColorsFromProducts();
    colors.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      kioskColorFilterSelect.appendChild(opt);
    });
  }
}

function getKioskFilteredProducts() {
  const search = kioskSearchInput
    ? kioskSearchInput.value.trim().toLowerCase()
    : "";
  const sizeVal = kioskSizeFilterSelect ? kioskSizeFilterSelect.value : "";
  const colorVal = kioskColorFilterSelect ? kioskColorFilterSelect.value : "";

  return products.filter((p) => {
    // respect hideKiosk / hideOnline flags
    if (p.flags && p.flags.hideKiosk) return false;

    if (!productMatchesFilters(p, kioskTypeFilter, kioskAudienceFilter)) {
      return false;
    }

    if (search && !p.name.toLowerCase().includes(search)) {
      return false;
    }

    if (sizeVal && !p.sizes.includes(sizeVal)) {
      return false;
    }

    if (colorVal && !p.colors.includes(colorVal)) {
      return false;
    }

    return true;
  });
}

function renderKiosk() {
  if (!kioskGrid) return;

  kioskGrid.innerHTML = "";

  const filtered = getKioskFilteredProducts();

  filtered.forEach((p) => {
    const div = document.createElement("div");
    div.className = "kiosk-item";

    // ----- Ribbon (same style as shop) -----
    const ribbonHtml = p.ribbon
      ? `<div class="product-ribbon product-ribbon-${p.ribbon
          .toLowerCase()
          .replace(/\s+/g, "-")}">${p.ribbon}</div>`
      : "";

    // Build size/qty maps from variations
    const sizesByColor = {};
    const qtyByColorSize = {};

    if (Array.isArray(p.squareVariations) && p.squareVariations.length > 0) {
      p.squareVariations.forEach((v) => {
        const colorKey = v.color || "Default";
        const sizeKey = v.size || "Standard";

        if (!sizesByColor[colorKey]) {
          sizesByColor[colorKey] = new Set();
        }
        sizesByColor[colorKey].add(sizeKey);

        const q = extractQtyFromVariation(v);
        if (!qtyByColorSize[colorKey]) {
          qtyByColorSize[colorKey] = {};
        }
        if (typeof q === "number") {
          qtyByColorSize[colorKey][sizeKey] = q;
        }
      });
    }

    if (Object.keys(sizesByColor).length === 0) {
      (p.colors || []).forEach((c) => {
        sizesByColor[c] = new Set(p.sizes || []);
      });
    }

    const colors = p.colors || Object.keys(sizesByColor) || [];
    const colorOptions = colors
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");

    const getSizeOptionsHtmlForColor = (colorVal) => {
      const setForColor = sizesByColor[colorVal];
      const sizesArr =
        setForColor && setForColor.size > 0
          ? Array.from(setForColor)
          : p.sizes;
      return (sizesArr || [])
        .map((s) => `<option value="${s}">${s}</option>`)
        .join("");
    };

    const initialColor = colors[0] || Object.keys(sizesByColor)[0] || "";
    const initialSizeOptions = getSizeOptionsHtmlForColor(initialColor);

    function getQtyText(colorVal, sizeVal) {
      const byColor = qtyByColorSize[colorVal];
      if (!byColor) return "Ask for availability";
      const q = byColor[sizeVal];
      if (typeof q === "number") return q;
      return "Ask for availability";
    }

    // Pick initial size
    let initialSize = "";
    const initialSet = sizesByColor[initialColor];
    if (initialSet && initialSet.size > 0) {
      initialSize = Array.from(initialSet)[0];
    } else if (p.sizes && p.sizes.length > 0) {
      initialSize = p.sizes[0];
    }

    const initialQtyText =
      initialColor && initialSize
        ? getQtyText(initialColor, initialSize)
        : "Ask for availability";

    div.innerHTML = `
      <div class="product-image-wrap">
        ${ribbonHtml}
        <img
          src="${
            p.image ||
            "https://via.placeholder.com/300x300?text=No+Image"
          }"
          alt="${p.name}"
          class="product-img"
        />
      </div>

      ${
        p.image
          ? `<button class="product-view-btn">View Larger</button>`
          : ""
      }

      <h2 class="product-name kiosk-name">${p.name}</h2>

      <div class="kiosk-details">
        <p>
          <strong>Color:</strong>
          <select class="kiosk-color">
            ${colorOptions}
          </select>
        </p>
        <p>
          <strong>Size:</strong>
          <select class="kiosk-size">
            ${initialSizeOptions}
          </select>
        </p>
        <p class="kiosk-qty">
          <strong>Qty Available:</strong> ${initialQtyText}
        </p>
      </div>
    `;

    const colorSelect = div.querySelector(".kiosk-color");
    const sizeSelect = div.querySelector(".kiosk-size");
    const qtyEl = div.querySelector(".kiosk-qty");
    const viewBtn = div.querySelector(".product-view-btn");

    if (colorSelect && sizeSelect && qtyEl) {
      // initialise values
      if (initialColor) colorSelect.value = initialColor;
      if (initialSize) sizeSelect.value = initialSize;

      const updateQty = () => {
        const c = colorSelect.value;
        const s = sizeSelect.value;
        const qtyText = getQtyText(c, s);
        qtyEl.innerHTML = `<strong>Qty Available:</strong> ${qtyText}`;
      };

      colorSelect.addEventListener("change", () => {
        const c = colorSelect.value;
        sizeSelect.innerHTML = getSizeOptionsHtmlForColor(c);

        const setForColor = sizesByColor[c];
        const newSize =
          setForColor && setForColor.size > 0
            ? Array.from(setForColor)[0]
            : (p.sizes && p.sizes[0]) || "";
        sizeSelect.value = newSize;
        updateQty();
      });

      sizeSelect.addEventListener("change", updateQty);
      updateQty();
    }

    if (viewBtn && p.image) {
      viewBtn.addEventListener("click", () => {
        openImageModal(p.image, p.name);
      });
    }

    kioskGrid.appendChild(div);
  });
}

function initKioskFilters() {
  if (kioskTypeFilterContainer) {
    const buttons = kioskTypeFilterContainer.querySelectorAll("button");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.type || btn.dataset.filter || "all";

        kioskTypeFilter = filter;

        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        renderKiosk();
      });
    });
  }

  if (kioskAudienceFilterContainer) {
    const buttons = kioskAudienceFilterContainer.querySelectorAll("button");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const aud = btn.dataset.audience || "all";
        kioskAudienceFilter = aud;

        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        renderKiosk();
      });
    });
  }

  if (kioskSearchInput) {
    kioskSearchInput.addEventListener("input", renderKiosk);
  }
  if (kioskSizeFilterSelect) {
    kioskSizeFilterSelect.addEventListener("change", renderKiosk);
  }
  if (kioskColorFilterSelect) {
    kioskColorFilterSelect.addEventListener("change", renderKiosk);
  }
  if (kioskClearFiltersBtn) {
    kioskClearFiltersBtn.addEventListener("click", () => {
      if (kioskSearchInput) kioskSearchInput.value = "";
      if (kioskSizeFilterSelect) kioskSizeFilterSelect.value = "";
      if (kioskColorFilterSelect) kioskColorFilterSelect.value = "";

      kioskTypeFilter = "all";
      if (kioskTypeFilterContainer) {
        const buttons = kioskTypeFilterContainer.querySelectorAll("button");
        buttons.forEach((b) => b.classList.remove("active"));
        const allBtn = kioskTypeFilterContainer.querySelector(
          '[data-filter="all"], [data-type="all"]'
        );
        if (allBtn) allBtn.classList.add("active");
      }

      renderKiosk();
    });
  }
}

// ========== KIOSK INACTIVITY TIMER ==========
let kioskInactivityTimer = null;

function showKioskSplash() {
  if (!kioskSplash || !kioskMain) return;
  kioskMain.classList.add("hidden");
  kioskSplash.classList.remove("hidden");
}

function hideKioskSplash() {
  if (!kioskSplash || !kioskMain) return;
  kioskSplash.classList.add("hidden");
  kioskMain.classList.remove("hidden");
}

function resetKioskInactivityTimer() {
  if (!kioskGrid) return;

  // If splash is currently showing, don't schedule a new one yet
  if (kioskSplash && !kioskSplash.classList.contains("hidden")) {
    return;
  }

  if (kioskInactivityTimer) {
    clearTimeout(kioskInactivityTimer);
  }

  kioskInactivityTimer = setTimeout(() => {
    showKioskSplash();
  }, 90 * 1000);
}

function initKioskInactivityWatcher() {
  if (!kioskGrid) return;

  // Show splash immediately on kiosk load
  showKioskSplash();

  // Clicking the splash hides it, renders grid, and starts the timer
  if (kioskSplash) {
    kioskSplash.addEventListener("click", () => {
      hideKioskSplash();
      renderKiosk();
      resetKioskInactivityTimer();
    });
  }

  // Any activity while browsing resets the inactivity timer
  ["click", "mousemove", "keydown", "touchstart", "scroll"].forEach((evt) => {
    document.addEventListener(evt, resetKioskInactivityTimer);
  });
}

function initKiosk() {
  if (!kioskGrid) return;

  renderKiosk();
  initKioskFilters();
  initKioskInactivityWatcher();
}

// ========== LOAD PRODUCTS FROM BACKEND ==========
async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    const squareProducts = await res.json();
    console.log("Loaded products from backend:", squareProducts);

    products = transformSquareProducts(squareProducts);
    console.log("Transformed products:", products);

    if (document.getElementById("product-grid")) {
      initShop();
    }
    if (document.getElementById("kiosk-grid")) {
      populateKioskFilterOptions();
      initKiosk();
    }

    updateCartDisplay();
  } catch (err) {
    console.error("Error loading products:", err);
    products = [];

    if (document.getElementById("product-grid")) {
      initShop();
    }
    if (document.getElementById("kiosk-grid")) {
      populateKioskFilterOptions();
      initKiosk();
    }
    updateCartDisplay();
  }
}

// ========== INITIALIZE ==========
document.addEventListener("DOMContentLoaded", () => {
  loadAnnouncementBanner();

  if (typeof initImageModalHandlers === "function") {
    initImageModalHandlers();
  }

  if (typeof loadProducts === "function") {
    loadProducts();
  }

  if (typeof updateCartDisplay === "function") {
    updateCartDisplay();
  }

  const checkoutBtn = document.getElementById("checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", handleCheckoutClick);
  }
});

// ===============================
//  CART PAGE: SHIPPING + BANNER
// ===============================

function spcRecalcCartShipping() {
  // Only run on the cart page
  const cartPage = document.querySelector(".cart-page");
  if (!cartPage) return;

  const subtotalEl = document.getElementById("cart-total");
  const shippingEl = document.getElementById("cart-shipping");
  const grandTotalEl = document.getElementById("cart-grand-total");
  const bannerEl = document.getElementById("free-shipping-banner");

  if (!subtotalEl || !shippingEl || !grandTotalEl || !bannerEl) return;

  // Read current subtotal (dollars) from DOM
  const raw = subtotalEl.textContent || subtotalEl.innerText || "0";
  const subtotal = Number(raw.replace(/[^0-9.]/g, "")) || 0;

  let shipping = 0;
  let bannerText = "";
  let bannerClass = "free-shipping-banner";

  const flat = Number(SHIPPING_FLAT_RATE || 0);
  const thresh = Number(FREE_SHIPPING_THRESHOLD || 0);

  if (subtotal <= 0) {
    // Empty cart
    shipping = 0;
    if (thresh > 0) {
      bannerText = `Free shipping on orders over $${thresh.toFixed(2)}.`;
    } else {
      bannerText = flat > 0
        ? `Flat-rate shipping $${flat.toFixed(2)} per order.`
        : "Shipping will be calculated at checkout.";
    }
  } else if (thresh > 0 && subtotal >= thresh) {
    // Qualifies for free shipping
    shipping = 0;
    bannerText = `🎉 Your order qualifies for FREE shipping!`;
    bannerClass += " free-shipping-achieved";
  } else {
    // Below free threshold or no threshold set
    shipping = flat > 0 ? flat : 0;

    if (thresh > 0) {
      const diff = Math.max(thresh - subtotal, 0);
      bannerText =
        `Free shipping on orders over $${thresh.toFixed(2)}. ` +
        `Add $${diff.toFixed(2)} more to get FREE shipping.`;
    } else if (flat > 0) {
      bannerText = `Flat-rate shipping $${flat.toFixed(2)} per order.`;
    } else {
      bannerText = "Shipping will be calculated at checkout.";
    }
  }

  // Update DOM
  shippingEl.textContent = shipping.toFixed(2);
  grandTotalEl.textContent = (subtotal + shipping).toFixed(2);

  bannerEl.textContent = bannerText;
  bannerEl.className = bannerClass;
}

async function spcInitCartShipping() {
  const cartPage = document.querySelector(".cart-page");
  if (!cartPage) return; // only on cart.html

  // 1) Fetch settings from /admin/config
  try {
    const res = await fetch(`${API_BASE}/admin/config`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.shippingFlatRate === "number") {
        SHIPPING_FLAT_RATE = data.shippingFlatRate;
      }
      if (typeof data.freeShippingThreshold === "number") {
        FREE_SHIPPING_THRESHOLD = data.freeShippingThreshold;
      }
    }
  } catch (err) {
    console.error("Failed to load shipping settings for cart:", err);
    // fall back to defaults
  }

  // 2) Initial calc once your existing cart code has filled in subtotal
  spcRecalcCartShipping();

  // 3) Watch for subtotal changes (e.g. qty changes, remove item, etc.)
  const subtotalEl = document.getElementById("cart-total");
  if (subtotalEl) {
    const observer = new MutationObserver(() => {
      spcRecalcCartShipping();
    });
    observer.observe(subtotalEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

// Register AFTER your main DOMContentLoaded in this file
document.addEventListener("DOMContentLoaded", spcInitCartShipping);
