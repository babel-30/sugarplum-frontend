// admin.js
// Assumes API_BASE is defined in config.js

document.addEventListener("DOMContentLoaded", () => {
  // =======================
  //  AUTH GUARD
  // =======================
  async function ensureAdminSession() {
    try {
      const res = await fetch(`${API_BASE}/admin/me`, {
        credentials: "include",
      });

      if (res.ok) {
        // Optionally could read admin info:
        // const data = await res.json();
        // console.log("Admin session:", data);
        return true;
      }

      // Not logged in – go to login page
      window.location.href = "admin-login.html";
      return false;
    } catch (err) {
      console.error("Error checking admin session:", err);
      window.location.href = "admin-login.html";
      return false;
    }
  }

  // =======================
  //  ELEMENT REFERENCES
  // =======================

  // --- Banner + popup ---
  const bannerForm = document.getElementById("banner-form");
  const bannerTextInput = document.getElementById("bannerText");
  const bannerVisibleCheckbox = document.getElementById("bannerVisible");
  const bannerStatusEl = document.getElementById("banner-status");

  // New popup controls (shop splash)
  const popupEnabledCheckbox = document.getElementById("popupEnabled");
  const popupModeSelect = document.getElementById("popupMode");
  const popupCustomTextInput = document.getElementById("popupCustomText");
  const popupStatusEl =
    document.getElementById("popup-status") || bannerStatusEl;

  // --- Orders table ---
  const refreshOrdersBtn = document.getElementById("refresh-orders");
  const ordersTbody = document.getElementById("orders-tbody");

  // --- Monthly archive ---
  const archiveBtn = document.getElementById("archive-current-month");
  const archiveStatusEl = document.getElementById("archive-status");

  // --- Products / inventory flags ---
  const flagsTbody =
    document.getElementById("flags-tbody") ||
    document.getElementById("products-tbody");
  const flagsStatusEl =
    document.getElementById("flags-status") ||
    document.getElementById("products-status");
  const saveFlagsBtn =
    document.getElementById("save-flags-btn") ||
    document.getElementById("save-products");
  const flagsSection = document.getElementById("flags-section");
  const flagsToggleBtn = document.getElementById("flags-toggle-btn");

  // We keep the latest products from /admin/products here
  let adminProducts = [];

  // =======================
  //  HELPER: STATUS MESSAGE
  // =======================
  function showStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "red" : "#000000";
  }

  // =======================
  //  BANNER + POPUP CONFIG
  // =======================
  async function loadBannerConfig() {
    if (!bannerTextInput || !bannerVisibleCheckbox) return;

    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        // GET /admin/config is public, no cookies needed
      });

      if (!res.ok) {
        throw new Error("Failed to load banner config");
      }

      const data = await res.json();

      // Banner
      bannerTextInput.value = data.bannerText || "";
      bannerVisibleCheckbox.checked = !!data.bannerVisible;

      // Popup (shop splash)
      if (popupEnabledCheckbox) {
        popupEnabledCheckbox.checked = !!data.popupEnabled;
      }
      if (popupModeSelect && typeof data.popupMode === "string") {
        popupModeSelect.value = data.popupMode;
      }
      if (popupCustomTextInput) {
        popupCustomTextInput.value = data.popupCustomText || "";
      }

      showStatus(bannerStatusEl, "Banner & popup loaded.", false);
    } catch (err) {
      console.error("Error loading banner config:", err);
      showStatus(bannerStatusEl, "Failed to load banner settings.", true);
    }
  }

  async function saveBannerConfig(e) {
    e.preventDefault();
    if (!bannerTextInput || !bannerVisibleCheckbox) return;

    const payload = {
      bannerText: bannerTextInput.value || "",
      bannerVisible: bannerVisibleCheckbox.checked,
    };

    // Include popup fields if those inputs exist
    if (popupEnabledCheckbox) {
      payload.popupEnabled = popupEnabledCheckbox.checked;
    }
    if (popupModeSelect) {
      payload.popupMode = popupModeSelect.value || "none";
    }
    if (popupCustomTextInput) {
      payload.popupCustomText = popupCustomTextInput.value || "";
    }

    showStatus(bannerStatusEl, "Saving...", false);

    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send admin session cookie
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save banner config");
      }

      const data = await res.json();
      console.log("Saved banner/popup config:", data);
      showStatus(bannerStatusEl, "Settings saved.", false);
      showStatus(popupStatusEl, "Popup settings saved.", false);
    } catch (err) {
      console.error("Error saving banner config:", err);
      showStatus(bannerStatusEl, "Failed to save banner settings.", true);
      showStatus(popupStatusEl, "Failed to save popup settings.", true);
    }
  }

  // =======================
  //  ORDERS TABLE
  // =======================
  function renderOrdersTable(orders) {
    if (!ordersTbody) return;

    if (!Array.isArray(orders) || orders.length === 0) {
      ordersTbody.innerHTML = `
        <tr>
          <td colspan="6">No orders found.</td>
        </tr>
      `;
      return;
    }

    const rowsHtml = orders
      .map((order) => {
        const dateStr = order.createdAt
          ? new Date(order.createdAt).toLocaleString()
          : "-";

        const totalStr =
          typeof order.total === "number"
            ? `$${order.total.toFixed(2)}`
            : "-";

        const customerLabel =
          order.customerName || order.customerEmail || "-";

        const statusValue = order.status || "PENDING";
        const trackingValue = order.trackingNumber || "";

        return `
          <tr data-order-id="${order.id}">
            <td>${dateStr}</td>
            <td>${customerLabel}</td>
            <td>${totalStr}</td>
            <td>
              <select class="order-status-input">
                <option value="PENDING" ${
                  statusValue === "PENDING" ? "selected" : ""
                }>PENDING</option>
                <option value="PAID" ${
                  statusValue === "PAID" ? "selected" : ""
                }>PAID</option>
                <option value="SHIPPED" ${
                  statusValue === "SHIPPED" ? "selected" : ""
                }>SHIPPED</option>
                <option value="CANCELLED" ${
                  statusValue === "CANCELLED" ? "selected" : ""
                }>CANCELLED</option>
              </select>
            </td>
            <td>
              <input
                type="text"
                class="order-tracking-input"
                placeholder="Tracking #"
                value="${trackingValue.replace(/"/g, "&quot;")}"
              />
            </td>
            <td>
              <button type="button" class="order-save-btn">
                Save
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    ordersTbody.innerHTML = rowsHtml;
  }

  async function loadOrders() {
    if (!ordersTbody) return;

    ordersTbody.innerHTML = `
      <tr>
        <td colspan="6">Loading orders…</td>
      </tr>
    `;

    try {
      const res = await fetch(`${API_BASE}/admin/orders`, {
        credentials: "include", // send admin cookie
      });

      if (res.status === 401) {
        ordersTbody.innerHTML = `
          <tr>
            <td colspan="6">Not authorized. Please log in again.</td>
          </tr>
        `;
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to load orders");
      }

      const data = await res.json();
      console.log("Loaded admin orders:", data);
      renderOrdersTable(data.orders || []);
    } catch (err) {
      console.error("Error loading orders:", err);
      ordersTbody.innerHTML = `
        <tr>
          <td colspan="6">Error loading orders.</td>
        </tr>
      `;
    }
  }

  // Save handler for status + tracking
  if (ordersTbody) {
    ordersTbody.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("order-save-btn")) return;

      const row = target.closest("tr");
      if (!row) return;

      const orderId = row.getAttribute("data-order-id");
      if (!orderId) return;

      const statusSelect = row.querySelector(".order-status-input");
      const trackingInput = row.querySelector(".order-tracking-input");

      const status = statusSelect ? statusSelect.value : undefined;
      const trackingNumber = trackingInput ? trackingInput.value : "";

      const originalText = target.textContent;
      target.disabled = true;
      target.textContent = "Saving...";

      try {
        const res = await fetch(`${API_BASE}/admin/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status,
            trackingNumber,
            notifyCustomer: false,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          console.error("Failed to update order:", data);
          target.textContent = "Error";
          setTimeout(() => {
            target.textContent = originalText;
            target.disabled = false;
          }, 1500);
          return;
        }

        console.log("Order updated:", data);
        target.textContent = "Saved";
        setTimeout(() => {
          target.textContent = originalText;
          target.disabled = false;
        }, 1200);
      } catch (err) {
        console.error("Error updating order:", err);
        target.textContent = "Error";
        setTimeout(() => {
          target.textContent = originalText;
          target.disabled = false;
        }, 1500);
      }
    });
  }

  // =======================
  //  MONTHLY ARCHIVE
  // =======================
  async function runMonthlyArchive() {
    if (!archiveStatusEl) return;

    showStatus(archiveStatusEl, "Starting monthly archive...");

    try {
      const res = await fetch(`${API_BASE}/admin/monthly-archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send admin cookie
        body: JSON.stringify({}), // server uses current month
      });

      if (res.status === 401) {
        showStatus(
          archiveStatusEl,
          "Not authorized. Please log in again.",
          true
        );
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || "Archive failed.";
        showStatus(archiveStatusEl, msg, true);
        return;
      }

      showStatus(archiveStatusEl, data.message || "Archive complete.");
    } catch (err) {
      console.error("Error running monthly archive:", err);
      showStatus(
        archiveStatusEl,
        "Error running monthly archive.",
        true
      );
    }
  }

  // =======================
  //  PRODUCTS / FLAGS UI
  // =======================

  function renderProductsTable(products) {
    if (!flagsTbody) return;

    if (!Array.isArray(products) || products.length === 0) {
      flagsTbody.innerHTML = `
        <tr>
          <td colspan="7">No products found.</td>
        </tr>
      `;
      return;
    }

    const rowsHtml = products
      .map((p) => {
        const flags = p.flags || {};
        const totalInv =
          typeof p.totalInventory === "number" ? p.totalInventory : 0;

        const ribbonType = flags.ribbonType || "none";
        const ribbonText = flags.ribbonCustomText || "";

        return `
          <tr data-product-id="${p.id}">
            <td class="prod-name">${p.name}</td>
            <td class="prod-subcat">${p.subcategory || "-"}</td>
            <td class="prod-inv">${totalInv}</td>

            <!-- Flags: only Pin to top now -->
            <td class="prod-flags">
              <label class="flag-pill">
                <input type="checkbox" class="flag-pinToTop" ${
                  flags.pinToTop ? "checked" : ""
                } />
                Pin to top
              </label>
            </td>

            <!-- Visibility -->
            <td class="prod-visibility">
              <label class="flag-pill">
                <input type="checkbox" class="flag-hideOnline" ${
                  flags.hideOnline ? "checked" : ""
                } />
                Hide Online
              </label>
              <label class="flag-pill">
                <input type="checkbox" class="flag-hideKiosk" ${
                  flags.hideKiosk ? "checked" : ""
                } />
                Hide Kiosk
              </label>
            </td>

            <!-- Ribbon dropdown + custom text -->
            <td class="prod-ribbon">
              <select class="flag-ribbonType">
                <option value="none" ${
                  ribbonType === "none" ? "selected" : ""
                }>No ribbon</option>
                <option value="new" ${
                  ribbonType === "new" ? "selected" : ""
                }>New</option>
                <option value="featured" ${
                  ribbonType === "featured" ? "selected" : ""
                }>Featured</option>
                <option value="custom" ${
                  ribbonType === "custom" ? "selected" : ""
                }>Custom</option>
              </select>
              <input
                type="text"
                class="flag-ribbonCustomText"
                placeholder="Custom ribbon text"
                value="${ribbonText.replace(/"/g, "&quot;")}"
              />
            </td>
          </tr>
        `;
      })
      .join("");

    flagsTbody.innerHTML = rowsHtml;
  }

  async function loadAdminProducts() {
    if (!flagsTbody) return;

    flagsTbody.innerHTML = `
      <tr>
        <td colspan="7">Loading products…</td>
      </tr>
    `;

    showStatus(flagsStatusEl, "Loading products...", false);

    try {
      const res = await fetch(`${API_BASE}/admin/products`, {
        credentials: "include",
      });

      if (res.status === 401) {
        flagsTbody.innerHTML = `
          <tr>
            <td colspan="7">Not authorized. Please log in again.</td>
          </tr>
        `;
        showStatus(
          flagsStatusEl,
          "Not authorized. Please log in again.",
          true
        );
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to load admin products");
      }

      const data = await res.json();
      adminProducts = Array.isArray(data.products) ? data.products : [];
      console.log("Loaded admin products:", adminProducts);

      renderProductsTable(adminProducts);
      showStatus(flagsStatusEl, "Products loaded.", false);
    } catch (err) {
      console.error("Error loading admin products:", err);
      flagsTbody.innerHTML = `
        <tr>
          <td colspan="7">Error loading products.</td>
        </tr>
      `;
      showStatus(flagsStatusEl, "Error loading products.", true);
    }
  }

  async function saveAdminProducts() {
    if (!flagsTbody) return;

    showStatus(flagsStatusEl, "Saving product flags...", false);

    const rows = flagsTbody.querySelectorAll("tr[data-product-id]");
    const updates = [];

    rows.forEach((row) => {
      const id = row.getAttribute("data-product-id");
      if (!id) return;

      const pinToTopEl = row.querySelector(".flag-pinToTop");
      const hideOnlineEl = row.querySelector(".flag-hideOnline");
      const hideKioskEl = row.querySelector(".flag-hideKiosk");
      const ribbonTypeEl = row.querySelector(".flag-ribbonType");
      const ribbonTextEl = row.querySelector(".flag-ribbonCustomText");

      const ribbonType = ribbonTypeEl ? ribbonTypeEl.value || "none" : "none";
      const ribbonCustomText = ribbonTextEl ? ribbonTextEl.value || "" : "";

      const isNew = ribbonType === "new";
      const isFeatured = ribbonType === "featured";

      const flags = {
        isNew,
        isFeatured,
        pinToTop: !!(pinToTopEl && pinToTopEl.checked),
        hideOnline: !!(hideOnlineEl && hideOnlineEl.checked),
        hideKiosk: !!(hideKioskEl && hideKioskEl.checked),
        ribbonType,
        ribbonCustomText,
      };

      updates.push({ id, flags });
    });

    try {
      const res = await fetch(`${API_BASE}/admin/products`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ products: updates }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || "Failed to save product flags.";
        showStatus(flagsStatusEl, msg, true);
        return;
      }

      console.log("Saved productConfig:", data);
      showStatus(flagsStatusEl, "Product flags saved.", false);
    } catch (err) {
      console.error("Error saving product flags:", err);
      showStatus(flagsStatusEl, "Error saving product flags.", true);
    }
  }

  // =======================
  //  EVENT LISTENERS
  // =======================
  if (bannerForm) {
    bannerForm.addEventListener("submit", saveBannerConfig);
  }

  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener("click", loadOrders);
  }

  if (archiveBtn) {
    archiveBtn.addEventListener("click", runMonthlyArchive);
  }

  if (saveFlagsBtn) {
    saveFlagsBtn.addEventListener("click", saveAdminProducts);
  }

  if (flagsToggleBtn && flagsSection) {
    flagsToggleBtn.addEventListener("click", () => {
      const collapsed = flagsSection.classList.toggle("flags-collapsed");
      flagsToggleBtn.textContent = collapsed
        ? "Expand Products"
        : "Collapse Products";
    });
  }

  // =======================
  //  INITIAL LOAD
  // =======================
  (async () => {
    const ok = await ensureAdminSession();
    if (!ok) return;

    loadBannerConfig();
    loadOrders();
    loadAdminProducts();
  })();
});
