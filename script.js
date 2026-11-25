/* ==========================================================
   Body Scent — shared script (used by every page)
   Each section runs only if its elements exist on the page.

   Element ids used:
     product.html : #filter-bar, #product-list
     order.html   : #orderForm, #customerName, #contact, #items, #total, #note
     admin.html   : #ordersTable tbody
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var PRODUCTS_URL = "products.json";

  var ORDER_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxWEwyvwLMv4JI-Y3je4LHJJLQTaShp1pzcCowRWCvo7wHj1xumTUYyKMhaew9K55M2/exec";

  var SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzvz1AQssPZOv8LiMz_468e4FmsVwPDAQnw1GxYMngzYmfJwHIRYV5BhxHAGN-CggS7ABMbeGkd7to/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all",       label: "ทั้งหมด" },
    { key: "fresh",     label: "Fresh" },
    { key: "sweet",     label: "Sweet" },
    { key: "confident", label: "Confident" },
    { key: "romance",   label: "Romance" }
  ];

  var TYPE_LABELS = { spray: "สเปรย์", rollon: "โรลออน" };

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(value) {
    var n = Number(value);
    return isNaN(n) ? String(value) : n.toLocaleString("th-TH");
  }

  /* ==========================================================
     1) product.html — product cards + mood filter
     ========================================================== */
  function initProductPage() {
    var filterBar = document.getElementById("filter-bar");
    var list = document.getElementById("product-list");
    if (!filterBar || !list) return;

    var products = [];
    var currentMood = "all";

    // Mood from URL: ?mood=fresh
    var moodParam = (new URLSearchParams(window.location.search).get("mood") || "").toLowerCase();
    var validMood = MOODS.some(function (m) { return m.key === moodParam; });
    if (validMood) currentMood = moodParam;

    function buildFilterBar() {
      filterBar.innerHTML = "";
      MOODS.forEach(function (m) {
        var btn = el("button", "filter", m.label);
        btn.type = "button";
        btn.dataset.mood = m.key;
        btn.addEventListener("click", function () {
          currentMood = m.key;
          updateFilterState();
          renderProducts();
        });
        filterBar.appendChild(btn);
      });
      updateFilterState();
    }

    function updateFilterState() {
      Array.prototype.forEach.call(filterBar.children, function (btn) {
        var active = btn.dataset.mood === currentMood;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function buildOrderUrl(p) {
      var itemName = p.name + (p.size ? " " + p.size : "");
      return (
        "order.html?item=" + encodeURIComponent(itemName) +
        "&price=" + encodeURIComponent(p.price)
      );
    }

    function buildCard(p) {
      var card = el("article", "product-card");
      card.dataset.mood = p.mood;

      var media = el("div", "product-card__media");
      var img = el("img");
      img.src = p.image;
      img.alt = p.name;
      img.loading = "lazy";
      media.appendChild(img);

      var body = el("div", "product-card__body");

      var moodLabel = el("span", "mood-label");
      moodLabel.appendChild(el("span", "mood-dot"));
      moodLabel.appendChild(
        document.createTextNode(p.mood.charAt(0).toUpperCase() + p.mood.slice(1))
      );

      var title = el("h3", "product-card__title", p.name);

      var metaText = (TYPE_LABELS[p.type] || p.type) + (p.size ? " " + p.size : "");
      var meta = el("p", "product-card__meta", metaText);

      var footer = el("div", "product-card__footer");
      var price = el("span", "price", formatPrice(p.price));
      price.appendChild(el("small", null, "บาท"));

      var buy = el("a", "btn btn--small", "สั่งซื้อ");
      buy.href = buildOrderUrl(p);

      footer.appendChild(price);
      footer.appendChild(buy);

      body.appendChild(moodLabel);
      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(footer);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function renderProducts() {
      list.innerHTML = "";
      var shown = products.filter(function (p) {
        return currentMood === "all" || p.mood === currentMood;
      });

      if (!shown.length) {
        list.appendChild(el("p", "text-muted", "ไม่พบสินค้าในหมวดนี้"));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    buildFilterBar();

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        renderProducts();
      })
      .catch(function (error) {
        console.error(error);
        list.innerHTML = "";
        list.appendChild(
          el("p", "text-muted", "โหลดข้อมูลสินค้าไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง")
        );
      });
  }

  /* ==========================================================
     2) order.html — prefill from URL + submit order
     ========================================================== */
  function initOrderPage() {
    var form = document.getElementById("orderForm");
    if (!form) return;

    var itemsInput = document.getElementById("items");
    var totalInput = document.getElementById("total");

    // Prefill: ?item=...&price=...
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");
    if (itemsInput && item !== null) itemsInput.value = item;
    if (totalInput && price !== null) totalInput.value = price;

    function val(id) {
      var node = document.getElementById(id);
      return node ? node.value.trim() : "";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var payload = {
        customerName: val("customerName"),
        contact: val("contact"),
        items: val("items"),
        total: val("total"),
        note: val("note")
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        if (submitBtn) submitBtn.disabled = false;
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      });
    });
  }

  /* ==========================================================
     3) admin.html — orders table from published Google Sheet CSV
     ========================================================== */

  // Minimal CSV parser: quoted fields, escaped quotes (""), commas and
  // line breaks inside quotes, CRLF / LF line endings, leading BOM.
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    // Last field / row without trailing newline
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }

    // Drop fully empty rows
    return rows.filter(function (r) {
      return r.some(function (c) { return c.trim() !== ""; });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector("#ordersTable tbody");
    if (!tbody) return;

    var COLUMNS = 6; // time, name, contact, items, total, note

    function showMessage(text) {
      tbody.innerHTML = "";
      var tr = el("tr");
      var td = el("td", "text-muted", text);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage("กำลังโหลดข้อมูล...");

    // Cache-busting param so the latest published data is requested
    var url = SHEET_CSV_URL + "&t=" + Date.now();

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // first row = header

        if (!rows.length) {
          showMessage("ยังไม่มีรายการสั่งซื้อ");
          return;
        }

        // Rows are appended to the sheet over time, so reversing
        // the order puts the newest order first.
        rows.reverse();

        tbody.innerHTML = "";
        rows.forEach(function (r) {
          var tr = el("tr");
          for (var c = 0; c < COLUMNS; c++) {
            var cell = r[c] !== undefined ? r[c] : "";
            if (c === 4 && cell !== "" && !isNaN(Number(cell))) {
              cell = formatPrice(cell);
            }
            tr.appendChild(el("td", null, cell));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage("โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง");
      });
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();
