/* ===========================================================
   STUDIO LENSA — Shared behavior
   =========================================================== */

// ---- GANTI INI dengan nomor WA bisnis kamu (format 62xxxxxxxxxx) ----
const WA_NUMBER = "6289526016022";

function buildWaLink(message) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${WA_NUMBER}?text=${text}`;
}

function wireWaFab() {
  const fab = document.querySelector(".wa-fab");
  if (!fab) return;

  fab.addEventListener("click", () => {
    const msg = "Halo Edotorial Photo, saya mau tanya-tanya soal jasa foto 🙏";
    window.open(buildWaLink(msg), "_blank");
  });

  let hideTimer;
  const HIDE_DELAY = 2000;

  function revealFab() {
    fab.classList.remove("wa-fab--peek");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => fab.classList.add("wa-fab--peek"), HIDE_DELAY);
  }

  fab.addEventListener("mouseenter", revealFab);
  fab.addEventListener("touchstart", revealFab, { passive: true });
  fab.addEventListener("mouseleave", () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => fab.classList.add("wa-fab--peek"), 800);
  });

  hideTimer = setTimeout(() => fab.classList.add("wa-fab--peek"), HIDE_DELAY);
}

// ---- Mode gelap / terang ----
// Catatan: sengaja tidak pakai localStorage (gak didukung di preview Claude).
// Saat sudah di-deploy ke domain sendiri, ini bisa ditambah localStorage
// biar pilihan mode-nya nempel terus walau halaman di-refresh.
function initTheme() {
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = prefersLight ? "light" : "dark";

  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = current === "dark" ? "light" : "dark";
    });
  });
}

// ---- Filter chip (portofolio kategori) ----
function wireChipFilter() {
  const chips = document.querySelectorAll(".chip[data-filter]");
  const cards = document.querySelectorAll("[data-category]");
  if (!chips.length) return;
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const filter = chip.dataset.filter;
      cards.forEach((card) => {
        const show = filter === "all" || card.dataset.category === filter;
        card.style.display = show ? "" : "none";
      });
    });
  });
}

// ---- Simple booking calendar ----
// dateStatus: "available" | "booked" | "past"
function renderCalendar(containerId, dateStatusMap, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const today = new Date();
  let viewMonth = today.getMonth();
  let viewYear = today.getFullYear();
  let selected = null;

  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const dayNames = ["M","S","S","R","K","J","S"];

  function key(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function draw() {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    let html = `
      <div class="cal-head">
        <button class="cal-nav" data-dir="-1" aria-label="Bulan sebelumnya">&#8249;</button>
        <span class="cal-title">${monthNames[viewMonth]} ${viewYear}</span>
        <button class="cal-nav" data-dir="1" aria-label="Bulan berikutnya">&#8250;</button>
      </div>
      <div class="cal-grid cal-dow">
        ${dayNames.map((d) => `<span>${d}</span>`).join("")}
      </div>
      <div class="cal-grid">
    `;

    for (let i = 0; i < firstDay; i++) html += `<span></span>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const k = key(viewYear, viewMonth, d);
      const cellDate = new Date(viewYear, viewMonth, d);
      const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const status = isPast ? "past" : (dateStatusMap[k] || "available");
      const isSelected = selected === k;
      html += `<button class="cal-day status-${status} ${isSelected ? "selected" : ""}" data-key="${k}" ${status !== "available" ? "disabled" : ""}>${d}</button>`;
    }

    html += `</div>`;
    el.innerHTML = html;

    el.querySelectorAll(".cal-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewMonth += parseInt(btn.dataset.dir, 10);
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        draw();
      });
    });

    el.querySelectorAll(".cal-day:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected = btn.dataset.key;
        draw();
        if (onSelect) onSelect(selected);
      });
    });
  }

  draw();
}

// ---- Lightbox sederhana untuk galeri ----
function wireLightbox() {
  const items = document.querySelectorAll("[data-lightbox]");
  if (!items.length) return;

  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `<img src="" alt=""><button class="lightbox-close" aria-label="Tutup">&times;</button>`;
  document.body.appendChild(overlay);

  const img = overlay.querySelector("img");
  const closeBtn = overlay.querySelector(".lightbox-close");

  items.forEach((item) => {
    item.addEventListener("click", () => {
      img.src = item.dataset.lightbox;
      overlay.classList.add("open");
    });
  });

  function close() { overlay.classList.remove("open"); }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

// ---- Hero slideshow ----
function initSlideshow() {
  const slides = document.querySelectorAll(".hero-slides .slide");
  const dots   = document.querySelectorAll(".slide-dot");
  if (!slides.length) return;
  let current = 0;

  setInterval(() => {
    slides[current].classList.remove("active");
    if (dots.length) dots[current].classList.remove("active");
    current = (current + 1) % slides.length;
    slides[current].classList.add("active");
    if (dots.length) dots[current].classList.add("active");
  }, 5000);
}

function initBottomNavHide() {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  let lastY = window.scrollY;
  let idleTimer;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => nav.classList.remove("bottom-nav--hidden"), 7000);
  }

  window.addEventListener("scroll", () => {
    const currentY = window.scrollY;
    if (currentY > lastY && currentY > 60) {
      nav.classList.add("bottom-nav--hidden");
    } else {
      nav.classList.remove("bottom-nav--hidden");
    }
    lastY = currentY;
    resetIdleTimer();
  }, { passive: true });

  ["touchstart", "mousemove", "keydown"].forEach((ev) =>
    window.addEventListener(ev, resetIdleTimer, { passive: true })
  );
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  wireWaFab();
  wireChipFilter();
  wireLightbox();
  initSlideshow();
  initBottomNavHide();
});
