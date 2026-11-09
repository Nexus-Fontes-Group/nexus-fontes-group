// ======================================================
// NEXUS FONTES GROUP - ADMINISTRATION
// ======================================================

const SUPABASE_URL = window.NFG_SUPABASE_URL;
const SUPABASE_KEY = window.NFG_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  alert("Configuration Supabase introuvable. Vérifiez nfg-config.js.");
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// UID autorisé à accéder à l'administration
const ADMIN_UID = "12b93f40-0108-47a9-971a-9103a8b4ba9d";

let currentProductImages = [];
let currentProjectImages = [];

// ======================================================
// OUTILS
// ======================================================

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(id, message, type = "success") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`;
}

function formatDate(value) {
  if (!value) return "Date non disponible";

  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function setLoading(buttonId, loading, text = "Enregistrement...") {
  const button = $(buttonId);
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || "Enregistrer";
    button.disabled = false;
  }
}

function imageHTML(url, alt = "Photo") {
  if (!url) return "";

  return `
    <img
      src="${escapeHTML(url)}"
      alt="${escapeHTML(alt)}"
      loading="lazy"
      onerror="this.style.display='none'"
    >
  `;
}

function getErrorMessage(error) {
  return error?.message || "Une erreur est survenue.";
}

// ======================================================
// AUTHENTIFICATION
// ======================================================

async function checkAdminSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    return;
  }

  const session = data.session;

  if (session && session.user.id === ADMIN_UID) {
    showAdmin();
  } else {
    showLogin();
  }
}

function showAdmin() {
  $("loginSection").hidden = true;
  $("app").hidden = false;

  loadCategories();
  loadProducts();
  loadProjects();
  loadSuppliers();
  loadMessages();
  loadTestimonials();
}

function showLogin() {
  $("loginSection").hidden = false;
  $("app").hidden = true;
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "Connexion...";

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  $("loginBtn").disabled = false;
  $("loginBtn").textContent = "Se connecter";

  if (error) {
    showMessage("loginMsg", getErrorMessage(error), "error");
    return;
  }

  if (data.user.id !== ADMIN_UID) {
    await db.auth.signOut();

    showMessage(
      "loginMsg",
      "Ce compte n'est pas autorisé à accéder à l'administration.",
      "error"
    );

    return;
  }

  $("loginMsg").textContent = "";
  showAdmin();
});

$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  showLogin();
});

// ======================================================
// NAVIGATION ENTRE LES SECTIONS
// ======================================================

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => {
      item.classList.remove("active");
    });

    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.remove("active");
    });

    button.classList.add("active");

    const panel = $(button.dataset.tab);
    if (panel) panel.classList.add("active");
  });
});

// ======================================================
// STOCKAGE DES PHOTOS
// ======================================================

async function uploadPhoto(file, folder) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier sélectionné doit être une image.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";

  const fileName =
    `${folder}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await db.storage
    .from("nfg-images")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = db.storage
    .from("nfg-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

async function uploadMultiplePhotos(files, folder) {
  const urls = [];

  for (const file of files) {
    const url = await uploadPhoto(file, folder);
    if (url) urls.push(url);
  }

  return urls;
}

// ======================================================
// CATÉGORIES DE LA MARKETPLACE
// ======================================================

async function loadCategories() {
  const select = $("pcat");

  const { data, error } = await db
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Erreur catégories :", error);
    select.innerHTML = `<option value="">Erreur de chargement</option>`;
    return;
  }

  select.innerHTML = `<option value="">Choisir une catégorie</option>`;

  (data || []).forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
}

// ======================================================
// PRODUITS : RÉINITIALISATION
// ======================================================

function resetProductForm() {
  $("productForm").reset();
  $("productId").value = "";
  $("pstock").value = "0";
  $("ppublished").checked = false;
  $("productMsg").textContent = "";
  currentProductImages = [];
}

$("resetProduct").addEventListener("click", resetProductForm);

// ======================================================
// PRODUITS : ENREGISTREMENT
// ======================================================

$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  setLoading("saveProduct", true);

  try {
    const id = $("productId").value;

    const product = {
      name: $("pname").value.trim(),
      description: $("pdesc").value.trim(),
      price: $("pprice").value ? Number($("pprice").value) : null,
      currency: $("pcurrency").value,
      category_id: $("pcat").value || null,
      reference: $("preference").value.trim() || null,
      stock_quantity: Number($("pstock").value || 0),
      is_published: $("ppublished").checked
    };

    if (!product.name) {
      throw new Error("Le nom du produit est obligatoire.");
    }

    const imageFile = $("pimage").files[0];

    let images = currentProductImages;

    if (imageFile) {
      const newImage = await uploadPhoto(imageFile, "marketplace");
      images = [newImage];
    }

    product.image_urls = images;

    let result;

    if (id) {
      result = await db
        .from("products")
        .update(product)
        .eq("id", id);
    } else {
      result = await db
        .from("products")
        .insert(product);
    }

    if (result.error) throw result.error;

    showMessage(
      "productMsg",
      id ? "Produit modifié avec succès." : "Produit ajouté avec succès."
    );

    resetProductForm();
    await loadProducts();

  } catch (error) {
    console.error(error);
    showMessage("productMsg", getErrorMessage(error), "error");
  } finally {
    setLoading("saveProduct", false);
  }
});

// ======================================================
// PRODUITS : AFFICHAGE
// ======================================================

async function loadProducts() {
  const container = $("products");

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun produit enregistré.</p>`;
    return;
  }

  container.innerHTML = data.map((product) => {
    const image = product.image_urls?.[0] || "";

    return `
      <article class="admin-item">
        ${imageHTML(image, product.name)}

        <h3>${escapeHTML(product.name)}</h3>

        <p>${escapeHTML(product.description || "Sans description")}</p>

        <p>
          Prix : ${product.price ?? "Sur demande"}
          ${escapeHTML(product.currency || "")}
        </p>

        <p>Stock : ${Number(product.stock_quantity || 0)}</p>

        <span class="status ${product.is_published ? "published" : "pending"}">
          ${product.is_published ? "Publié" : "Non publié"}
        </span>

        <div class="actions">
          <button class="btn btn-secondary" data-edit-product="${escapeHTML(product.id)}">
            Modifier
          </button>

          <button class="btn btn-danger" data-delete-product="${escapeHTML(product.id)}">
            Supprimer
          </button>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      editProduct(data.find((item) => item.id === button.dataset.editProduct));
    });
  });

  container.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteProduct(button.dataset.deleteProduct);
    });
  });
}

function editProduct(product) {
  if (!product) return;

  $("productId").value = product.id;
  $("pname").value = product.name || "";
  $("pdesc").value = product.description || "";
  $("pprice").value = product.price ?? "";
  $("pcurrency").value = product.currency || "USD";
  $("pcat").value = product.category_id || "";
  $("preference").value = product.reference || "";
  $("pstock").value = product.stock_quantity ?? 0;
  $("ppublished").checked = Boolean(product.is_published);

  currentProductImages = product.image_urls || [];

  $("productMsg").textContent =
    "Modification du produit : " + product.name;

  $("productsPanel").scrollIntoView({ behavior: "smooth" });
}

async function deleteProduct(id) {
  if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;

  const { error } = await db
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  await loadProducts();
}

// ======================================================
// PROJETS : RÉINITIALISATION
// ======================================================

function resetProjectForm() {
  $("projectForm").reset();
  $("projectId").value = "";
  $("projectPublished").checked = false;
  $("projectMsg").textContent = "";
  currentProjectImages = [];
}

$("resetProject").addEventListener("click", resetProjectForm);

// ======================================================
// PROJETS : ENREGISTREMENT AVEC PLUSIEURS PHOTOS
// ======================================================

$("projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  setLoading("saveProject", true);

  try {
    const id = $("projectId").value;

    const project = {
      title: $("projectTitle").value.trim(),
      location: $("projectLocation").value.trim(),
      category: $("projectCategory").value,
      description: $("projectDesc").value.trim(),
      is_published: $("projectPublished").checked
    };

    if (!project.title || !project.category) {
      throw new Error("Le titre et la catégorie sont obligatoires.");
    }

    const files = Array.from($("projectImage").files || []);

    const newImages = await uploadMultiplePhotos(files, "projets");

    project.image_urls = [
      ...currentProjectImages,
      ...newImages
    ];

    let result;

    if (id) {
      result = await db
        .from("projects")
        .update(project)
        .eq("id", id);
    } else {
      result = await db
        .from("projects")
        .insert(project);
    }

    if (result.error) throw result.error;

    showMessage(
      "projectMsg",
      id ? "Projet modifié avec succès." : "Projet ajouté avec succès."
    );

    resetProjectForm();
    await loadProjects();

  } catch (error) {
    console.error(error);
    showMessage("projectMsg", getErrorMessage(error), "error");
  } finally {
    setLoading("saveProject", false);
  }
});

// ======================================================
// PROJETS : AFFICHAGE
// ======================================================

async function loadProjects() {
  const container = $("projectList");

  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun projet enregistré.</p>`;
    return;
  }

  container.innerHTML = data.map((project) => {
    const images = project.image_urls || [];

    return `
      <article class="admin-item">
        ${imageHTML(images[0], project.title)}

        <h3>${escapeHTML(project.title)}</h3>

        <p>${escapeHTML(project.category || "")}</p>
        <p>${escapeHTML(project.location || "")}</p>
        <p>${escapeHTML(project.description || "Sans description")}</p>
        <p>${images.length} photo(s) enregistrée(s)</p>

        <span class="status ${project.is_published ? "published" : "pending"}">
          ${project.is_published ? "Publié" : "Non publié"}
        </span>

        <div class="actions">
          <button class="btn btn-secondary" data-edit-project="${escapeHTML(project.id)}">
            Modifier
          </button>

          <button class="btn btn-danger" data-delete-project="${escapeHTML(project.id)}">
            Supprimer
          </button>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      editProject(data.find((item) => item.id === button.dataset.editProject));
    });
  });

  container.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteProject(button.dataset.deleteProject);
    });
  });
}

function editProject(project) {
  if (!project) return;

  $("projectId").value = project.id;
  $("projectTitle").value = project.title || "";
  $("projectLocation").value = project.location || "";
  $("projectCategory").value = project.category || "";
  $("projectDesc").value = project.description || "";
  $("projectPublished").checked = Boolean(project.is_published);

  currentProjectImages = project.image_urls || [];

  showMessage(
    "projectMsg",
    `Modification de « ${project.title} ». Les nouvelles photos seront ajoutées aux anciennes.`
  );

  $("projectsPanel").scrollIntoView({ behavior: "smooth" });
}

async function deleteProject(id) {
  if (!confirm("Voulez-vous vraiment supprimer ce projet ?")) return;

  const { error } = await db
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  await loadProjects();
}

// ======================================================
// CANDIDATURES FOURNISSEURS
// ======================================================

async function loadSuppliers() {
  const container = $("suppliers");

  const { data, error } = await db
    .from("supplier_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucune candidature reçue.</p>`;
    return;
  }

  container.innerHTML = data.map((item) => `
    <article class="admin-item">
      <h3>${escapeHTML(item.company_name)}</h3>
      <p><strong>Contact :</strong> ${escapeHTML(item.contact_name)}</p>
      <p><strong>E-mail :</strong> ${escapeHTML(item.email)}</p>
      <p><strong>Téléphone :</strong> ${escapeHTML(item.telephone)}</p>
      <p><strong>Adresse :</strong> ${escapeHTML(item.adresse)}</p>
      <p>${escapeHTML(item.message || "")}</p>
      <p class="small-note">Reçu le ${formatDate(item.created_at)}</p>
    </article>
  `).join("");
}

// ======================================================
// MESSAGES CLIENTS
// ======================================================

async function loadMessages() {
  const container = $("inquiries");

  const { data, error } = await db
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun message reçu.</p>`;
    return;
  }

  container.innerHTML = data.map((item) => `
    <article class="admin-item">
      <h3>${escapeHTML(item.subject || "Message sans objet")}</h3>
      <p><strong>Nom :</strong> ${escapeHTML(item.name)}</p>
      <p><strong>E-mail :</strong> ${escapeHTML(item.email)}</p>
      <p><strong>Téléphone :</strong> ${escapeHTML(item.phone)}</p>
      <p>${escapeHTML(item.message)}</p>
      <p class="small-note">Reçu le ${formatDate(item.created_at)}</p>
    </article>
  `).join("");
}

// ======================================================
// TÉMOIGNAGES : AFFICHAGE ET MODÉRATION
// ======================================================

async function loadTestimonials() {
  const container = $("reviews");

  const { data, error } = await db
    .from("testimonials")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun témoignage reçu.</p>`;
    return;
  }

  container.innerHTML = data.map((item) => {
    const approved = Boolean(item.is_approved);

    return `
      <article class="admin-item">
        <h3>${escapeHTML(item.customer_name)}</h3>

        <p>${escapeHTML(item.content)}</p>

        <p>Note : ${Number(item.rating || 0)} / 5</p>

        <span class="status ${approved ? "approved" : "pending"}">
          ${approved ? "Approuvé" : "En attente de validation"}
        </span>

        <div class="actions">
          ${
            approved
              ? `<button class="btn btn-secondary" data-review-action="reject" data-review-id="${escapeHTML(item.id)}">Retirer du site</button>`
              : `<button class="btn btn-success" data-review-action="approve" data-review-id="${escapeHTML(item.id)}">Approuver</button>`
          }
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => {
      updateTestimonial(
        button.dataset.reviewId,
        button.dataset.reviewAction === "approve"
      );
    });
  });
}

async function updateTestimonial(id, approved) {
  const { error } = await db
    .from("testimonials")
    .update({ is_approved: approved })
    .eq("id", id);

  if (error) {
    alert("Erreur lors de la mise à jour : " + error.message);
    return;
  }

  await loadTestimonials();
}

// ======================================================
// DÉMARRAGE
// ======================================================

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showLogin();
  }
});

checkAdminSession();
