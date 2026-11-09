(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* MENU MOBILE */

  const menuButton = $(".menu-toggle");
  const navigation = $(".nav");

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const opened = navigation.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(opened));
    });

    navigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navigation.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* CARROUSEL */

  const slides = Array.from(document.querySelectorAll(".slide"));
  const dotsContainer = $(".dots");
  let currentSlide = 0;
  let carouselTimer = null;

  if (slides.length && dotsContainer) {
    dotsContainer.innerHTML = "";

    slides.forEach((slide, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Afficher la diapositive " + (index + 1));
      dot.addEventListener("click", () => {
        showSlide(index);
        restartCarousel();
      });
      dotsContainer.appendChild(dot);
    });

    const dots = Array.from(dotsContainer.querySelectorAll("button"));

    function showSlide(index) {
      slides[currentSlide].classList.remove("active");
      dots[currentSlide]?.classList.remove("active");

      currentSlide = (index + slides.length) % slides.length;

      slides[currentSlide].classList.add("active");
      dots[currentSlide]?.classList.add("active");
    }

    function nextSlide() {
      showSlide(currentSlide + 1);
    }

    function previousSlide() {
      showSlide(currentSlide - 1);
    }

    function startCarousel() {
      clearInterval(carouselTimer);
      carouselTimer = setInterval(nextSlide, 6000);
    }

    function restartCarousel() {
      startCarousel();
    }

    $(".next")?.addEventListener("click", () => {
      nextSlide();
      restartCarousel();
    });

    $(".prev")?.addEventListener("click", () => {
      previousSlide();
      restartCarousel();
    });

    dots[0]?.classList.add("active");
    startCarousel();
  }

  /* SUPABASE */

  const configured =
    window.NFG_SUPABASE_URL &&
    window.NFG_SUPABASE_ANON_KEY &&
    window.supabase &&
    !window.NFG_SUPABASE_URL.includes("VOTRE-PROJET") &&
    !window.NFG_SUPABASE_ANON_KEY.includes("VOTRE_CLE");

  const db = configured
    ? window.supabase.createClient(
        window.NFG_SUPABASE_URL,
        window.NFG_SUPABASE_ANON_KEY
      )
    : null;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function feedback(selector, text, error = false) {
    const element = $(selector);
    if (!element) return;

    element.textContent = text;
    element.style.color = error ? "#a12b18" : "#246b45";
  }

  function showFallback(selector, text) {
    const element = $(selector);
    if (element) element.innerHTML = `<p>${escapeHTML(text)}</p>`;
  }

  if (!db) {
    showFallback("#catalogue-produits", "Le catalogue sera disponible après activation de la connexion.");
    showFallback("#projets-dynamiques", "Les projets publiés apparaîtront ici.");
    showFallback("#avis-publies", "Les témoignages validés apparaîtront ici.");
  } else {
    loadProducts();
    loadProjects();
    loadTestimonials();
    setupForms();
  }

  /* PRODUITS */

  async function loadProducts() {
    const container = $("#catalogue-produits");
    if (!container) return;

    container.innerHTML = "<p>Chargement du catalogue...</p>";

    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      showFallback("#catalogue-produits", "Le catalogue est momentanément indisponible.");
      return;
    }

    if (!data?.length) {
      showFallback("#catalogue-produits", "Aucun produit publié pour le moment. Contactez NFG pour toute demande.");
      return;
    }

    container.innerHTML = data.map((product) => {
      const images = Array.isArray(product.image_urls)
        ? product.image_urls
        : [];

      const image = images[0] || "";

      return `
        <article class="product-card">
          ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" loading="lazy">` : ""}
          <div class="product-card-content">
            <h3>${escapeHTML(product.name)}</h3>
            <p>${escapeHTML(product.description || "")}</p>
            <p><strong>${
              product.price != null
                ? Number(product.price).toLocaleString("fr-FR") + " " + escapeHTML(product.currency || "USD")
                : "Prix sur demande"
            }</strong></p>
            <button class="btn btn-dark" type="button" data-order="${escapeHTML(product.id)}">
              Demander ce produit
            </button>
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-order]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = data.find((item) => String(item.id) === button.dataset.order);
        if (!product) return;

        const subject = $("#contact-form [name='subject']");
        const message = $("#contact-form [name='message']");

        if (subject) subject.value = "Demande de produit : " + product.name;
        if (message) message.value = "Je souhaite obtenir des informations sur le produit : " + product.name;

        location.hash = "contact";
      });
    });
  }

  /* PROJETS */

  async function loadProjects() {
    const container = $("#projets-dynamiques");
    if (!container) return;

    container.innerHTML = "<p>Chargement des projets...</p>";

    const { data, error } = await db
      .from("projects")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      showFallback("#projets-dynamiques", "Les projets sont momentanément indisponibles.");
      return;
    }

    if (!data?.length) {
      showFallback("#projets-dynamiques", "Aucun projet publié pour le moment.");
      return;
    }

    container.innerHTML = data.map((project) => {
      const images = Array.isArray(project.image_urls)
        ? project.image_urls
        : [];

      const image = images[0] || "";
      const category = project.category || "Projet NFG";

      return `
        <article class="project-card" data-project-category="${escapeHTML(category)}">
          ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(project.title)}" loading="lazy">` : ""}
          <div class="project-card-content">
            <span class="project-category">${escapeHTML(category)}</span>
            <h3>${escapeHTML(project.title)}</h3>
            <p>${escapeHTML(project.description || "")}</p>
            ${project.location ? `<p>${escapeHTML(project.location)}</p>` : ""}
          </div>
        </article>
      `;
    }).join("");

    setupProjectFilters();
  }

  /* FILTRES DU PORTFOLIO */

  function setupProjectFilters() {
    const filters = $("#project-filters");
    const cards = document.querySelectorAll("[data-project-category]");

    if (!filters) return;

    filters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const category = button.dataset.category;

        filters.querySelectorAll("button").forEach((item) => {
          item.classList.remove("selected");
        });

        button.classList.add("selected");

        cards.forEach((card) => {
          const cardCategory = card.dataset.projectCategory;
          card.hidden = category !== "all" && cardCategory !== category;
        });
      });
    });
  }

  /* TÉMOIGNAGES */

  async function loadTestimonials() {
    const container = $("#avis-publies");
    if (!container) return;

    container.innerHTML = "<p>Chargement des témoignages...</p>";

    const { data, error } = await db
      .from("testimonials")
      .select("customer_name,content,rating")
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) {
      showFallback("#avis-publies", "Les témoignages validés seront bientôt disponibles.");
      return;
    }

    if (!data?.length) {
      showFallback("#avis-publies", "Aucun témoignage publié pour le moment.");
      return;
    }

    container.innerHTML = data.map((review) => {
      const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));

      return `
        <blockquote>
          <strong>${escapeHTML(review.customer_name)}</strong>
          <p aria-label="${rating} étoiles">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</p>
          <p>${escapeHTML(review.content)}</p>
        </blockquote>
      `;
    }).join("");
  }

  /* FORMULAIRES */

  function setupForms() {
    const supplierForm = $("#supplier-form");

    if (supplierForm) {
      supplierForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const values = Object.fromEntries(new FormData(supplierForm).entries());

        feedback("#supplier-feedback", "Envoi de la candidature...");

        const { error } = await db
          .from("supplier_applications")
          .insert(values);

        if (error) {
          feedback("#supplier-feedback", "Envoi impossible. Veuillez réessayer plus tard.", true);
          return;
        }

        feedback("#supplier-feedback", "Votre candidature a bien été envoyée à NFG.");
        supplierForm.reset();
      });
    }

    const reviewForm = $("#review-form");

    if (reviewForm) {
      reviewForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const values = Object.fromEntries(new FormData(reviewForm).entries());
        values.rating = Number(values.rating);

        feedback("#review-feedback", "Envoi du témoignage...");

        const { error } = await db
          .from("testimonials")
          .insert(values);

        if (error) {
          feedback("#review-feedback", "Le témoignage n'a pas pu être envoyé. Veuillez réessayer.", true);
          return;
        }

        feedback("#review-feedback", "Merci pour votre témoignage. Il sera vérifié avant publication.");
        reviewForm.reset();
      });
    }

    const contactForm = $("#contact-form");

    if (contactForm) {
      contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const values = Object.fromEntries(new FormData(contactForm).entries());

        feedback("#contact-feedback", "Envoi de votre demande...");

        const { error } = await db
          .from("contact_messages")
          .insert(values);

        if (error) {
          feedback("#contact-feedback", "Votre demande n'a pas pu être envoyée. Veuillez réessayer.", true);
          return;
        }

        feedback("#contact-feedback", "Votre demande a bien été transmise à Nexus Fontes Group.");
        contactForm.reset();
      });
    }
  }

})();
