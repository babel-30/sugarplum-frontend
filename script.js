// ========== CONFIG ==========  

// Shipping config defaults (front-end; overwritten by admin settings on cart page)
let SHIPPING_FLAT_RATE = 6.95; // example USPS-ish flat rate for ~3 shirts
let FREE_SHIPPING_THRESHOLD = 75; // free shipping when subtotal >= $75

// Front-end fee + tax estimates (mirrors backend intent)
const CONVENIENCE_FEE_RATE = 0.03; // 3% card fee
const SALES_TAX_RATE = 0.07; // 7% sales tax estimate

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

// ===== Shop filter DOM elements (to mirror kiosk) =====
const shopSearchInput = document.getElementById("shop-search");
const shopSizeFilterSelect = document.getElementById("shop-size-filter");
const shopColorFilterSelect = document.getElementById("shop-color-filter");
const shopClearFiltersBtn = document.getElementById("shop-clear-filters");

// ========== MASTER SIZE & COLOR LISTS (CAPABILITY) ==========
// Expanded to include extended sizes and common aliases for 2X, 3X, 4X, 5X
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
  "2X",
  "2XL",
  "XXL",
  "3X",
  "3XL",
  "XXXL",
  "4X",
  "4XL",
  "5X",
  "5XL",
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
// NOTE: your backend keeps amounts authoritative; this is a visual estimate.

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

// ========== SUGAR PLUM ALERT MODAL ==========
// (Fixed: lazy-init after DOM is ready so popups actually work everywhere)

let spcAlertOverlay = null;
let spcAlertTitleEl = null;
let spcAlertMsgEl = null;
let spcAlertBtnEl = null;

function initSpcAlertModal() {
  spcAlertOverlay = document.getElementById("spc-alert-overlay");
  if (!spcAlertOverlay) {
    // Overlay not present on this page; showSpcAlert will NO LONGER use window.alert.
    // It will just log to console instead so we don’t get annoying browser popups.
    return;
  }

  spcAlertTitleEl = spcAlertOverlay.querySelector(".spc-alert-title");
  spcAlertMsgEl = spcAlertOverlay.querySelector(".spc-alert-message");
  spcAlertBtnEl = spcAlertOverlay.querySelector(".spc-alert-button");

  if (spcAlertBtnEl) {
    spcAlertBtnEl.addEventListener("click", () => {
      spcAlertOverlay.classList.remove("active");
    });
  }

  spcAlertOverlay.addEventListener("click", (e) => {
    if (e.target === spcAlertOverlay) {
      spcAlertOverlay.classList.remove("active");
    }
  });
}

function showSpcAlert(message, type = "info") {
  // If the fancy overlay isn’t available on this page, do NOT use native alert.
  // Just log to the console so we don't slam the user with popups.
  if (!spcAlertOverlay || !spcAlertMsgEl || !spcAlertTitleEl) {
    console.warn("Sugar Plum alert:", type, message);
    return;
  }

  const alertBox = spcAlertOverlay.querySelector(".spc-alert");
  if (alertBox) {
    alertBox.className = "spc-alert spc-alert-" + type;
  }

  spcAlertMsgEl.textContent = message;

  if (type === "error") {
    spcAlertTitleEl.textContent = "Uh-oh!";
  } else if (type === "warning") {
    spcAlertTitleEl.textContent = "Heads Up!";
  } else {
    spcAlertTitleEl.textContent = "Notice";
  }

  spcAlertOverlay.classList.add("active");
}


// Global cart state
let cart = loadCartFromStorage();

// Common cart UI elements (may be null on some pages)

// Header bubble (index.html)
const cartCountEl = document.getElementById("cart-count"); // little bubble count
const cartTotalEl = document.getElementById("cart-total"); // little bubble subtotal (no $)

// Cart page summary (cart.html)
const cartSummaryItemsEl = document.getElementById("summary-total-items");
const cartSummarySubtotalEl = document.getElementById("summary-subtotal");
const cartDetailsEl = document.getElementById("cart-details");

// Cart page money breakdown
const cartShippingEl = document.getElementById("summary-shipping");
const cartGrandTotalEl = document.getElementById("summary-order-total");
const cartFeeEl = document.getElementById("summary-convenience-fee");
const cartTaxEl = document.getElementById("summary-sales-tax");

// Free shipping banner
const freeShipBannerEl = document.getElementById("free-shipping-banner");

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
// NOTE: backend still recomputes true fee/tax; this is just visual guidance.
async function handleCheckoutClick() {
  if (!cart || !cart.length) {
    showSpcAlert("Your cart is empty.", "warning");
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
    showSpcAlert("Please enter your name.", "warning");
    return;
  }
  if (!customer.email) {
    showSpcAlert("Please enter your email address.", "warning");
    return;
  }

  // Recompute totals here to keep in sync with backend (shipping estimate only)
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
      printSide: item.printSide || null, // Front / Back / Front & Back
      price: Math.round(item.price * 100), // cents
      quantity: item.qty || 1,
      squareVariationId: item.squareVariationId || item.catalogObjectId || null,
      catalogObjectId: item.catalogObjectId || item.squareVariationId || null,
    }));

    const body = {
      cart: payloadCart,
      customer,
      shippingTotalCents, // backend currently ignores this, but harmless
    };

    console.log("FRONTEND raw cart:", cart);
    console.log("FRONTEND payload body:", body);

    const res = await fetch(`${API_BASE}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // ===== SPECIAL CASE: inventory conflict (409 OUT_OF_STOCK) =====
    if (res.status === 409) {
      let errJson = {};
      try {
        errJson = await res.json();
      } catch (_) {
        errJson = {};
      }

      if (
        errJson &&
        errJson.type === "OUT_OF_STOCK" &&
        Array.isArray(errJson.conflicts)
      ) {
        const conflicts = errJson.conflicts;

        // Adjust the local cart based on what the server says is left
        conflicts.forEach((conf) => {
          const pid = conf.productId || null;
          const confColor = (conf.color || "").toLowerCase();
          const confSize = (conf.size || "").toLowerCase();
          const available =
            typeof conf.availableQty === "number" ? conf.availableQty : 0;

          for (let i = cart.length - 1; i >= 0; i--) {
            const item = cart[i];
            const itemColor = (item.color || "").toLowerCase();
            const itemSize = (item.size || "").toLowerCase();

            const sameProduct =
              (!!pid && item.id === pid) ||
              (!pid && item.name === conf.name); // loose fallback by name

            if (
              sameProduct &&
              itemColor === confColor &&
              itemSize === confSize
            ) {
              if (available <= 0) {
                // Completely gone → remove from cart
                cart.splice(i, 1);
              } else if (available < item.qty) {
                // Only partially available → clamp qty
                item.qty = available;
              }
            }
          }
        });

        // Persist + refresh UI
        saveCartToStorage();
        updateCartDisplay();

        // Optional: refresh products so stock/status reflect new reality
        try {
          await loadProducts();
        } catch (e) {
          console.warn("Failed to reload products after conflict:", e);
        }

        // Build a friendly message for the customer
        const lines = conflicts.map((c) => {
          const name = c.name || "Item";
          const color = c.color ? ` – Color: ${c.color}` : "";
          const size = c.size ? ` – Size: ${c.size}` : "";
          const req = typeof c.requestedQty === "number" ? c.requestedQty : "?";
          const avail =
            typeof c.availableQty === "number" && c.availableQty >= 0
              ? c.availableQty
              : 0;

          if (avail <= 0) {
            return `• ${name}${color}${size} is no longer available and was removed from your cart.`;
          } else if (avail < req) {
            return `• ${name}${color}${size}: you requested ${req}, but only ${avail} remain. Your cart was updated to ${avail}.`;
          } else {
            return `• ${name}${color}${size}: quantity adjusted based on current stock.`;
          }
        });

        const fullMessage =
          "Looks like one or more items in your cart just sold out or changed while you were checking out.\n\n" +
          "We’ve updated your cart to match what’s currently available. Please review your cart and try checkout again.\n\n" +
          lines.join("\n");

        showSpcAlert(fullMessage, "warning");
        return; // stop here; do NOT redirect to Square
      }

      // If we got a 409 but without the structured payload, fall through to generic error
    }

    // ===== Generic non-OK error handling =====
    if (!res.ok) {
      console.error("Checkout error status:", res.status);
      let err = {};
      try {
        err = await res.json();
      } catch (_) {
        err = {};
      }
      showSpcAlert(
        "There was a problem starting checkout: " +
          (err.error || `HTTP ${res.status}`),
        "error"
      );
      return;
    }

    // ===== Success: go to Square checkout =====
    const data = await res.json();

    if (!data.checkoutUrl) {
      showSpcAlert("Checkout URL missing from server response.", "error");
      return;
    }

    // Send the customer to Square's checkout page
    window.location.href = data.checkoutUrl;
  } catch (error) {
    console.error("Checkout failed:", error);
    showSpcAlert(
      "Something went wrong starting checkout. Please try again.",
      "error"
    );
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

// ========== CART RENDERING & HELPERS ==========

// Helper: find the full Square variation object for a given product/color/size
function findSquareVariation(product, color, size) {
  if (!Array.isArray(product.squareVariations)) return null;

  const colorLower = (color || "").toLowerCase();
  const sizeLower = (size || "").toLowerCase();

  const match = product.squareVariations.find((v) => {
    const vColor = (v.color || "").toLowerCase();
    const vSize = (v.size || "").toLowerCase();
    return vColor === colorLower && vSize === sizeLower;
  });

  return match || null;
}

// Helper: find Square variation ID for a given product/color/size
// (now prefers catalogObjectId, falls back to id)
function findSquareVariationId(product, color, size) {
  const match = findSquareVariation(product, color, size);
  if (!match) return null;
  return match.catalogObjectId || match.id || null;
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

// NEW: infer print location from variation name (Square puts it in the name)
function inferPrintLocationFromName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();

  if (lower.includes("front & back") || lower.includes("front and back")) {
    return "Front & Back";
  }
  // Check "front" before "back" so we don't mis-read "Front & Back"
  if (lower.includes("front")) return "Front";
  if (lower.includes("back")) return "Back";

  return null;
}

// Get maximum allowed quantity for a specific cart item based on inventory
function getMaxAvailableQtyForCartItem(cartItem) {
  if (!cartItem) return 9999;

  const product = products.find((p) => p.id === cartItem.id);
  if (!product) return 9999;

  // Prefer variant-level inventory if we can match a variation
  if (Array.isArray(product.squareVariations)) {
    const colorLower = (cartItem.color || "").toLowerCase();
    const sizeLower = (cartItem.size || "").toLowerCase();

    const variation = product.squareVariations.find((v) => {
      const vColor = (v.color || "").toLowerCase();
      const vSize = (v.size || "").toLowerCase();
      return vColor === colorLower && vSize === sizeLower;
    });

    if (variation) {
      const q = extractQtyFromVariation(variation);
      if (typeof q === "number" && q > 0) {
        return q;
      }
    }
  }

  // Fall back to product-level inventory
  if (typeof product.inventory === "number" && product.inventory > 0) {
    return product.inventory;
  }

  // If unknown, treat as effectively unlimited
  return 9999;
}

// Centralized cart quantity update (respects stock limits)
function updateCartItemQuantity(index, newQty) {
  const item = cart[index];
  if (!item) return;

  if (newQty <= 0) {
    // Remove item if qty goes to 0 or below
    cart.splice(index, 1);
  } else {
    const maxQty = getMaxAvailableQtyForCartItem(item);
    let finalQty = newQty;
    if (finalQty > maxQty) {
      finalQty = maxQty;
      showSpcAlert(
        "You’ve reached the maximum available stock for this item.",
        "warning"
      );
    }
    item.qty = finalQty;
  }

  saveCartToStorage();
  updateCartDisplay();
}

function renderCartDetails() {
  if (!cartDetailsEl) return;

  if (cart.length === 0) {
    cartDetailsEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
    return;
  }

  const linesHtml = cart
    .map((item, index) => {
      const lineTotal = (item.qty * item.price).toFixed(2);

      const metaBits = [];
      if (item.type && item.type !== "Other") metaBits.push(item.type);
      if (item.color) metaBits.push(item.color);
      if (item.size) metaBits.push(item.size);
      if (item.printSide) metaBits.push(`${item.printSide} print`);
      const metaText = metaBits.join(" • ");

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
              ${metaText}
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

  // Wire up +/-/remove buttons via stock–aware helper
  cartDetailsEl.querySelectorAll(".cart-inc").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      const item = cart[idx];
      if (!item) return;
      updateCartItemQuantity(idx, item.qty + 1);
    });
  });

  cartDetailsEl.querySelectorAll(".cart-dec").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      const item = cart[idx];
      if (!item) return;
      updateCartItemQuantity(idx, item.qty - 1);
    });
  });

  cartDetailsEl.querySelectorAll(".cart-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      updateCartItemQuantity(idx, 0);
    });
  });
}

function updateCartDisplay() {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

  // ----- Shipping -----
  const shipping = computeShipping(subtotal);

  // ----- State-based tax: MS only, everyone else 0% -----
  let localTaxRate = 0; // default: no tax
  const stateInput = document.getElementById("checkout-state");
  if (stateInput) {
    const stateVal = stateInput.value.trim().toUpperCase();
    if (stateVal === "MS" || stateVal === "MISSISSIPPI") {
      localTaxRate = SALES_TAX_RATE; // 0.07
    }
  }

  // ----- 3% Convenience Fee: on (items + shipping) -----
  const feeBase = subtotal + shipping;
  const convenienceFee =
    CONVENIENCE_FEE_RATE > 0
      ? Number((feeBase * CONVENIENCE_FEE_RATE).toFixed(2))
      : 0;

  // ----- Estimated Sales Tax: on (items + shipping), NOT the fee -----
  const taxBase = subtotal + shipping;
  const estimatedTax =
    localTaxRate > 0 ? Number((taxBase * localTaxRate).toFixed(2)) : 0;

  // ----- Grand Total (estimate) -----
  const grandTotal = subtotal + shipping + convenienceFee + estimatedTax;

  // ===== Header bubble (index.html) =====
  if (cartCountEl) cartCountEl.textContent = totalItems;
  if (cartTotalEl) cartTotalEl.textContent = subtotal.toFixed(2); // no $ here; HTML already has it

  // ===== Cart page summary (cart.html) =====
  if (cartSummaryItemsEl) cartSummaryItemsEl.textContent = totalItems;
  if (cartSummarySubtotalEl) {
    cartSummarySubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  }
  if (cartShippingEl) {
    cartShippingEl.textContent = `$${shipping.toFixed(2)}`;
  }
  if (cartFeeEl) {
    cartFeeEl.textContent = `$${convenienceFee.toFixed(2)}`;
  }
  if (cartTaxEl) {
    cartTaxEl.textContent = `$${estimatedTax.toFixed(2)}`;
  }
  if (cartGrandTotalEl) {
    cartGrandTotalEl.textContent = `$${grandTotal.toFixed(2)}`;
  }

  // Free shipping banner logic still based on MERCH subtotal
  if (freeShipBannerEl) {
    if (subtotal <= 0) {
      freeShipBannerEl.textContent = `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD.toFixed(
        2
      )}.`;
    } else if (subtotal >= FREE_SHIPPING_THRESHOLD) {
      freeShipBannerEl.textContent = "You’re getting FREE shipping!";
    } else {
      const diff = FREE_SHIPPING_THRESHOLD - subtotal;
      freeShipBannerEl.textContent = `Add $${diff.toFixed(
        2
      )} more for FREE shipping.`;
    }
  }

  renderCartDetails();
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

// Add-to-cart with stock limit enforcement + variant-specific price/IDs
function addToCart(product, color, size, qty, printSide = null) {
  if (qty <= 0) return;

  const normalizedPrintSide = printSide || null;

  const existing = cart.find(
    (item) =>
      item.id === product.id &&
      item.color === color &&
      item.size === size &&
      (item.printSide || null) === normalizedPrintSide
  );

  // Build a temporary "cart item" shape for stock lookup
  const tempItem = {
    id: product.id,
    color,
    size,
  };
  const maxAvailable = getMaxAvailableQtyForCartItem(tempItem);

  const currentQty = existing ? existing.qty : 0;
  let requestedTotal = currentQty + qty;

  if (requestedTotal > maxAvailable) {
    requestedTotal = maxAvailable;
    showSpcAlert(
      "You’ve reached the maximum available stock for this item.",
      "warning"
    );
  }

  const amountToAdd = requestedTotal - currentQty;
  if (amountToAdd <= 0) {
    // Already at or above max; nothing more to add
    return;
  }

  // Look up the matching variation so we can use its price and ID
  const variation = findSquareVariation(product, color, size);
  let priceDollars = product.price; // fallback
  let variationId = null;

  if (variation) {
    if (typeof variation.price === "number") {
      priceDollars = variation.price;
    } else if (variation.price != null) {
      const parsed = Number(variation.price);
      if (!Number.isNaN(parsed)) {
        priceDollars = parsed;
      }
    }

    variationId = variation.catalogObjectId || variation.id || null;
  }

  if (existing) {
    existing.qty = requestedTotal;
    // keep price and IDs synced with current Square variation
    existing.price = priceDollars;
    existing.squareVariationId = variationId;
    existing.catalogObjectId = variationId;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      type: product.type,
      price: priceDollars, // dollars, variant-specific
      color,
      size,
      printSide: normalizedPrintSide,
      qty: requestedTotal,
      image: product.image || null,
      squareVariationId: variationId,
      catalogObjectId: variationId,
    });
  }

  saveCartToStorage();
  updateCartDisplay();
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
      flags.isNew || (item.isNew !== undefined ? item.isNew : !!meta.isNew);
    const pinToTop =
      flags.pinToTop ||
      (item.pinToTop !== undefined ? item.pinToTop : !!meta.pinToTop);

    let basePrice = 0;
    const sizeSet = new Set();
    const colorSet = new Set();
    const printLocationSet = new Set();
    let totalInventory = 0;

    for (const v of variations) {
      const p = typeof v.price === "number" ? v.price : Number(v.price) || 0;
      if (p > 0 && (basePrice === 0 || p < basePrice)) {
        basePrice = p;
      }
      if (v.size) sizeSet.add(v.size);
      if (v.color) colorSet.add(v.color);

      // derive print location from name if needed
      let printLocation = v.printLocation || inferPrintLocationFromName(v.name);
      if (printLocation) {
        v.printLocation = printLocation;
        printLocationSet.add(printLocation);
      }

      const q = extractQtyFromVariation(v);
      if (typeof q === "number" && q > 0) {
        totalInventory += q;
      }
    }

    // Build sizes/colors from the variation sets; if missing, fallback
    let sizes = sizeSet.size > 0 ? Array.from(sizeSet) : ["Standard"];
    let colors = colorSet.size > 0 ? Array.from(colorSet) : ["Default"];

    // Sort sizes/colors using master lists so extended sizes stay in order
    if (typeof sortByMasterOrder === "function") {
      sizes = sortByMasterOrder(sizes, MASTER_SIZES);
      colors = sortByMasterOrder(colors, MASTER_COLORS);
    }

    // If we couldn't compute inventory from variations, fall back to item.inventory if present
    let inventory = totalInventory;
    if (inventory === 0 && typeof item.inventory === "number") {
      inventory = item.inventory;
    }

    const printLocations =
      printLocationSet.size > 0 ? Array.from(printLocationSet) : [];

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
      printLocations,
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

// Helper: get the correct variant price for a given color/size (fallback to product base price)
function getVariantPrice(product, color, size) {
  // Uses the shared helper we defined earlier
  const variation = findSquareVariation(product, color, size);
  if (variation) {
    if (typeof variation.price === "number") {
      return variation.price;
    } else if (variation.price != null) {
      const parsed = Number(variation.price);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  // Fallback: product-level base price
  return product.price || 0;
}

function renderShop() {
  if (!productGrid) return;

  productGrid.innerHTML = "";

  const searchTerm = shopSearchInput
    ? shopSearchInput.value.trim().toLowerCase()
    : "";
  const sizeVal = shopSizeFilterSelect ? shopSizeFilterSelect.value : "";
  const colorVal = shopColorFilterSelect ? shopColorFilterSelect.value : "";

  // Apply filters and hide-online flag
  const filtered = products.filter((p) => {
    // hideOnline flag
    if (p.flags && p.flags.hideOnline) return false;

    // type + audience (same as kiosk)
    if (!productMatchesFilters(p, activeTypeFilter, activeAudienceFilter)) {
      return false;
    }

    // search by design name
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) {
      return false;
    }

    // size filter
    if (sizeVal && !(p.sizes || []).includes(sizeVal)) {
      return false;
    }

    // color filter
    if (colorVal && !(p.colors || []).includes(colorVal)) {
      return false;
    }

    return true;
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

    // ===== NEW: build an "in-stock" view of variations =====
    const allVariations = Array.isArray(p.squareVariations)
      ? p.squareVariations
      : [];

    // Only keep variations where qty > 0, if we know qty
    const inStockVariations = allVariations.filter((v) => {
      const q = extractQtyFromVariation(v);
      return typeof q === "number" && q > 0;
    });

    // If we couldn't detect any counts, fall back to all variations
    const variationsForUi =
      inStockVariations.length > 0 ? inStockVariations : allVariations;

    // Build color → size map from *in-stock* variations
    const sizesByColor = {};
    if (variationsForUi.length > 0) {
      variationsForUi.forEach((v) => {
        const colorKey = v.color || "Default";
        if (!sizesByColor[colorKey]) {
          sizesByColor[colorKey] = new Set();
        }
        if (v.size) {
          sizesByColor[colorKey].add(v.size);
        }
      });
    }

    // Fallback: no variation info at all → use product-level colors/sizes
    if (Object.keys(sizesByColor).length === 0) {
      (p.colors || []).forEach((c) => {
        sizesByColor[c] = new Set(p.sizes || []);
      });
    }

    // Only show colors that actually have at least one size option
    let colors = Object.keys(sizesByColor);
    if (!colors.length && p.colors && p.colors.length > 0) {
      colors = p.colors;
    }

    const getSizeOptionsHtml = (colorVal) => {
      const setForColor = sizesByColor[colorVal];
      let sizesArr;
      if (setForColor && setForColor.size > 0) {
        sizesArr = Array.from(setForColor);
      } else {
        sizesArr = p.sizes || [];
      }
      return sizesArr.map((s) => `<option value="${s}">${s}</option>`).join("");
    };

    const initialColor = colors[0] || Object.keys(sizesByColor)[0] || "";

    // Determine initial size for that color
    let initialSize = "";
    const initialSet = sizesByColor[initialColor];
    if (initialSet && initialSet.size > 0) {
      initialSize = Array.from(initialSet)[0];
    } else if (p.sizes && p.sizes.length > 0) {
      initialSize = p.sizes[0];
    }

    const initialSizeOptions = getSizeOptionsHtml(initialColor);

    // ----- Build print locations from product.printLocations or variations -----
    let productPrintLocations = Array.isArray(p.printLocations)
      ? p.printLocations.slice()
      : [];

    if (
      productPrintLocations.length === 0 &&
      Array.isArray(p.squareVariations)
    ) {
      const locSet = new Set();
      p.squareVariations.forEach((v) => {
        const loc = v.printLocation || inferPrintLocationFromName(v.name);
        if (loc) locSet.add(loc);
      });
      productPrintLocations = Array.from(locSet);
    }

    const hasPrintOptions = productPrintLocations.length > 0;

    const stock = getStockStatus(p);
    const typeLabel = p.type === "Other" ? "" : `${p.type} • `;

    const isOutOfStock =
      typeof p.inventory === "number" ? p.inventory <= 0 : false;

    const ribbonHtml = p.ribbon
      ? `<div class="product-ribbon product-ribbon-${p.ribbon
          .toLowerCase()
          .replace(/\s+/g, "-")}">${p.ribbon}</div>`
      : "";

    const printLabelHtml = hasPrintOptions
      ? `
      <label>
        Print:
        <select class="product-print" ${isOutOfStock ? "disabled" : ""}>
          ${productPrintLocations
            .map((loc) => `<option value="${loc}">${loc}</option>`)
            .join("")}
        </select>
      </label>
    `
      : "";

    // Compute initial display price based on initial color/size
    const initialPrice = getVariantPrice(p, initialColor, initialSize);

    div.innerHTML = `
      <div class="product-image-wrap">
        ${ribbonHtml}
        <img
          src="${
            p.image || "https://via.placeholder.com/300x300?text=No+Image"
          }"
          alt="${p.name}"
          class="product-img"
        />
      </div>

      ${
        p.image ? `<button class="product-view-btn">View Larger</button>` : ""
      }

      <h3 class="product-name">${p.name}</h3>
      <p class="product-type">${typeLabel}$${initialPrice.toFixed(2)}</p>
      <p class="stock-status ${stock.cssClass}">${stock.text}</p>

      <label>
        Color:
        <select class="product-color" ${isOutOfStock ? "disabled" : ""}>
          ${colors.map((c) => `<option value="${c}">${c}</option>`).join("")}
        </select>
      </label>

      <label>
        Size:
        <select class="product-size" ${isOutOfStock ? "disabled" : ""}>
          ${initialSizeOptions}
        </select>
      </label>

      ${printLabelHtml}

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
        <button class="add-to-cart" ${isOutOfStock ? "disabled" : ""}>
          Add to Cart
        </button>
      </div>
    `;

    const colorSelect = div.querySelector(".product-color");
    const sizeSelect = div.querySelector(".product-size");
    const printSelect = div.querySelector(".product-print");
    const qtyInput = div.querySelector(".product-qty");
    const addBtn = div.querySelector(".add-to-cart");
    const viewBtn = div.querySelector(".product-view-btn");
    const priceEl = div.querySelector(".product-type");

    // Helper to sync displayed price with current color/size selection
    function updateDisplayedPrice() {
      const selectedColor =
        (colorSelect && colorSelect.value) || initialColor || "Default";

      let selectedSize =
        (sizeSelect && sizeSelect.value) || initialSize || "Standard";

      // If size is blank for some reason, try first option in sizeSelect
      if ((!selectedSize || selectedSize === "") && sizeSelect) {
        const opt = sizeSelect.options[0];
        if (opt) selectedSize = opt.value;
      }

      const price = getVariantPrice(p, selectedColor, selectedSize);
      if (priceEl) {
        priceEl.textContent = `${typeLabel}$${price.toFixed(2)}`;
      }
    }

    if (colorSelect && sizeSelect) {
      // Set initial values
      if (initialColor) colorSelect.value = initialColor;
      if (initialSize) sizeSelect.value = initialSize;

      colorSelect.addEventListener("change", () => {
        const selectedColor = colorSelect.value;
        sizeSelect.innerHTML = getSizeOptionsHtml(selectedColor);

        // Pick a reasonable default size for the new color
        const setForColor = sizesByColor[selectedColor];
        const newSize =
          setForColor && setForColor.size > 0
            ? Array.from(setForColor)[0]
            : (p.sizes && p.sizes[0]) || "";

        if (newSize) {
          sizeSelect.value = newSize;
        }

        updateDisplayedPrice();
      });

      sizeSelect.addEventListener("change", () => {
        updateDisplayedPrice();
      });
    }

    // Initialize price once everything is wired up
    updateDisplayedPrice();

    if (addBtn && !isOutOfStock) {
      addBtn.addEventListener("click", () => {
        const color =
          (colorSelect && colorSelect.value) || colors[0] || "Default";
        const size =
          (sizeSelect && sizeSelect.value) || p.sizes[0] || "Standard";

        const printSide = hasPrintOptions
          ? (printSelect && printSelect.value) ||
            productPrintLocations[0] ||
            null
          : null;

        const qty = parseInt(qtyInput.value, 10) || 1;

        // Call the existing addToCart logic (which now uses variant-specific price & IDs)
        addToCart(p, color, size, qty, printSide);

        // Temporary "Added to cart" feedback on the button
        const originalText = addBtn.textContent;
        addBtn.textContent = "Added to cart";
        addBtn.disabled = true;

        setTimeout(() => {
          addBtn.textContent = originalText;
          addBtn.disabled = false;
        }, 1000);
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

  // ---- Shop search / size / color filters (mirror kiosk) ----
  if (shopSearchInput) {
    shopSearchInput.addEventListener("input", renderShop);
  }
  if (shopSizeFilterSelect) {
    shopSizeFilterSelect.addEventListener("change", renderShop);
  }
  if (shopColorFilterSelect) {
    shopColorFilterSelect.addEventListener("change", renderShop);
  }
  if (shopClearFiltersBtn) {
    shopClearFiltersBtn.addEventListener("click", () => {
      if (shopSearchInput) shopSearchInput.value = "";
      if (shopSizeFilterSelect) shopSizeFilterSelect.value = "";
      if (shopColorFilterSelect) shopColorFilterSelect.value = "";

      // Reset type chips
      activeTypeFilter = "all";
      if (categoryFilterContainer) {
        const buttons = categoryFilterContainer.querySelectorAll("button");
        buttons.forEach((b) => b.classList.remove("active"));
        const allBtn = categoryFilterContainer.querySelector(
          '[data-filter="all"], [data-type="all"]'
        );
        if (allBtn) allBtn.classList.add("active");
      }

      // Reset audience chips
      activeAudienceFilter = "all";
      if (audienceFilterContainer) {
        const buttons = audienceFilterContainer.querySelectorAll("button");
        buttons.forEach((b) => b.classList.remove("active"));
        const allBtn = audienceFilterContainer.querySelector(
          '[data-audience="all"]'
        );
        if (allBtn) allBtn.classList.add("active");
      }

      renderShop();
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

// Helpers for kiosk and shop filters
function sortByMasterOrder(values, masterList) {
  const orderMap = new Map();
  masterList.forEach((val, idx) => orderMap.set(val, idx));
  return values.slice().sort((a, b) => {
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

// ---- Populate shop dropdowns (mirror kiosk) ----
function populateShopFilterOptions() {
  if (shopSizeFilterSelect) {
    shopSizeFilterSelect.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "All Sizes";
    shopSizeFilterSelect.appendChild(first);

    const sizes = getAllAvailableSizesFromProducts();
    sizes.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      shopSizeFilterSelect.appendChild(opt);
    });
  }

  if (shopColorFilterSelect) {
    shopColorFilterSelect.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "All Colors";
    shopColorFilterSelect.appendChild(first);

    const colors = getAllAvailableColorsFromProducts();
    colors.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      shopColorFilterSelect.appendChild(opt);
    });
  }
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
    // respect hideKiosk flag
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

        // Only use real sizes; skip blank ones so we don't invent "Standard"
        const sizeRaw = (v.size || "").trim();
        if (!sizeRaw) {
          return; // skip this variation if it doesn't have a size label
        }
        const sizeKey = sizeRaw;

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

    const colors =
      p.colors && p.colors.length > 0
        ? p.colors
        : Object.keys(sizesByColor) || [];

    const colorOptions = colors
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");

    const getSizeOptionsHtmlForColor = (colorVal) => {
      const setForColor = sizesByColor[colorVal];
      const sizesArr =
        setForColor && setForColor.size > 0 ? Array.from(setForColor) : p.sizes;
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

    // Build print locations for kiosk display
    let kioskPrintLocations = Array.isArray(p.printLocations)
      ? p.printLocations.slice()
      : [];
    if (
      kioskPrintLocations.length === 0 &&
      Array.isArray(p.squareVariations)
    ) {
      const locSet = new Set();
      p.squareVariations.forEach((v) => {
        const loc = v.printLocation || inferPrintLocationFromName(v.name);
        if (loc) locSet.add(loc);
      });
      kioskPrintLocations = Array.from(locSet);
    }
    const hasPrintOptions = kioskPrintLocations.length > 0;

    const printHtml = hasPrintOptions
      ? `
        <p>
          <strong>Print:</strong>
          <select class="kiosk-print">
            ${kioskPrintLocations
              .map((loc) => `<option value="${loc}">${loc}</option>`)
              .join("")}
          </select>
        </p>
      `
      : "";

    div.innerHTML = `
      <div class="product-image-wrap">
        ${ribbonHtml}
        <img
          src="${
            p.image || "https://via.placeholder.com/300x300?text=No+Image"
          }"
          alt="${p.name}"
          class="product-img"
        />
      </div>

      ${
        p.image ? `<button class="product-view-btn">View Larger</button>` : ""
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
        ${printHtml}
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

      kioskAudienceFilter = "all";
      if (kioskAudienceFilterContainer) {
        const buttons =
          kioskAudienceFilterContainer.querySelectorAll("button");
        buttons.forEach((b) => b.classList.remove("active"));
        const allBtn = kioskAudienceFilterContainer.querySelector(
          '[data-audience="all"]'
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
      populateShopFilterOptions();
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
      populateShopFilterOptions();
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
  // Init custom alert modal first so all showSpcAlert calls work
  initSpcAlertModal();

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

  // ----- Attach checkout handler -----
  const checkoutBtn = document.getElementById("checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", handleCheckoutClick);
  }

  // ----- Recalculate tax when the shipping state changes -----
  const checkoutStateInput = document.getElementById("checkout-state");
  if (checkoutStateInput) {
    checkoutStateInput.addEventListener("input", updateCartDisplay);
    checkoutStateInput.addEventListener("change", updateCartDisplay);
    checkoutStateInput.addEventListener("blur", updateCartDisplay);
  }

  // ===== MOVE-TO-TOP BUTTON (GLOBAL) =====
  const moveToTopBtn = document.getElementById("moveToTopBtn");
  if (moveToTopBtn) {
    const toggleMoveToTop = () => {
      if (window.scrollY > 200) {
        moveToTopBtn.classList.add("visible");
      } else {
        moveToTopBtn.classList.remove("visible");
      }
    };

    window.addEventListener("scroll", toggleMoveToTop);
    // run once
    toggleMoveToTop();

    moveToTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

// ===============================
//  CART PAGE: SHIPPING/FEE/TAX + BANNER
// ===============================

function spcRecalcCartShipping() {
  const cartPage = document.querySelector(".cart-page");
  if (!cartPage) return;

  // Single source of truth for all totals (shipping + fee + tax + banner)
  updateCartDisplay();
}

async function spcInitCartShipping() {
  const cartPage = document.querySelector(".cart-page");
  if (!cartPage) return; // only on cart.html

  try {
    const res = await fetch(`${API_BASE}/admin/config`);
    if (res.ok) {
      const data = await res.json();

      // These often come back as strings, so coerce safely
      if (data.shippingFlatRate != null && !isNaN(data.shippingFlatRate)) {
        SHIPPING_FLAT_RATE = parseFloat(data.shippingFlatRate);
      }
      if (
        data.freeShippingThreshold != null &&
        !isNaN(data.freeShippingThreshold)
      ) {
        FREE_SHIPPING_THRESHOLD = parseFloat(data.freeShippingThreshold);
      }
    }
  } catch (err) {
    console.error("Failed to load shipping settings for cart:", err);
    // fall back to defaults (6.95 / 75) if config fails
  }

  // Initial calc now that shipping settings are loaded
  spcRecalcCartShipping();
}

// Register AFTER your main DOMContentLoaded in this file
document.addEventListener("DOMContentLoaded", spcInitCartShipping);
