/* NFG - Administration */

const config = window.NFG_CONFIG || window.NFG || {};

const supabaseUrl =
  config.url ||
  config.supabaseUrl ||
  window.NFG_SUPABASE_URL ||
  window.SUPABASE_URL ||
  (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "");

const supabaseKey =
  config.anonKey ||
  config.publishableKey ||
  config.key ||
  window.NFG_SUPABASE_ANON_KEY ||
  window.SUPABASE_ANON_KEY ||
  (typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : "");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configuration Supabase introuvable dans nfg-config.js");
}

const db = window.supabase.createClient(supabaseUrl, supabaseKey);
const $ = (id) => document.getElementById(id);

let currentProduct = null;
let currentProject = null;
let categories = [];

function message(id, text, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = text;
  element.style.color = error ? "#b42318" : "#18794e";
}

function showApp(connected) {
  $("login")?.classList.toggle("hidden", connected);
  $("app")?.classList.toggle("hidden", !connected);
}

function addText(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value ?? "";
  parent.appendChild(element);
  return element;
}

async function login() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    message("loginMsg", "Veuillez remplir les deux champs.", true);
    return;
  }

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    message("loginMsg", error.message, true);
    return;
  }

  showApp(true);
  await loadDashboard();
}

async function logout() {
  await db.auth.signOut();
  showApp(false);
}

async function uploadImage(file, folder) {
  if (!file) return null;

  const extension = file.name.split(".").pop().toLowerCase();
  const allowed = ["jpg", "jpeg", "png", "webp", "svg"];

  if (!allowed.includes(extension)) {
    throw new Error("Format d'image non accepté.");
  }

  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from("NFG-images")
    .upload(path, file, { upsert: false });

  if (error) throw error;

  const { data } = db.storage
    .from("NFG-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function loadCategories() {
  const { data, error } = await db
    .from("categories")
    .select("id,name")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Catégories :", error.message);
    categories = [];
    return;
  }

  categories = data || [];
}

function getCategoryId(name) {
  const category = categories.find(
    (item) => item.name.toLowerCase() === name.trim().toLowerCase()
  );
  return category?.id || null;
}

/* PRODUITS */

async function loadProducts() {
  const container = $("products");
  if (!container) return;

  container.textContent = "Chargement des produits...";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Erreur : " + error.message;
    return;
  }

  container.replaceChildren();

  if (!data?.length) {
    container.textContent = "Aucun produit enregistré.";
    return;
  }

  data.forEach((product) => {
    const card = document.createElement("div");
    card.className = "item";

    addText(card, "h3", product["Nom"]);
    addText(card, "p", `Prix : ${product["Prix"] ?? ""} ${product["Monnaie"]}`);
    addText(card, "p", `Référence : ${product["Référence"] || "Non renseignée"}`);
    addText(card, "p", `Stock : ${product.stock_quantity}`);
    addText(card, "p", product.is_published ? "Publié" : "Non publié");

    const edit = document.createElement("button");
    edit.textContent = "Modifier";
    edit.type = "button";
    edit.addEventListener("click", () => editProduct(product));
    card.appendChild(edit);

    const remove = document.createElement("button");
    remove.textContent = "Supprimer";
    remove.type = "button";
    remove.addEventListener("click", () => deleteProduct(product.id));
    card.appendChild(remove);

    container.appendChild(card);
  });
}

function editProduct(product) {
  currentProduct = product;

  $("productId").value = product.id;
  $("pname").value = product["Nom"] || "";
  $("pcat").value =
    categories.find((c) => c.id === product.category_id)?.name || "";
  $("pprice").value = product["Prix"] ?? "";
  $("pcurrency").value = product["Monnaie"] || "USD";
  $("pdesc").value = product["Description"] || "";
  $("pavailability").value =
    product.stock_quantity > 0 ? "En stock" : "Sur commande";
  $("ppublished").checked = product.is_published;

  message("productMsg", "Modification du produit sélectionné.");
  $("productForm")?.scrollIntoView({ behavior: "smooth" });
}

function resetProductForm() {
  currentProduct = null;
  $("productForm")?.reset();
  if ($("productId")) $("productId").value = "";
  message("productMsg", "");
}

async function saveProduct(event) {
  event.preventDefault();

  try {
    const name = $("pname").value.trim();
    const categoryName = $("pcat").value.trim();
    const price = Number($("pprice").value);

    if (!name || !categoryName || !Number.isFinite(price)) {
      throw new Error("Vérifiez le nom, la catégorie et le prix.");
    }

    const categoryId = getCategoryId(categoryName);

    if (!categoryId) {
      throw new Error(
        "Cette catégorie n'existe pas encore dans la table categories."
      );
    }

    const file = $("pimage")?.files?.[0];
    let images = currentProduct?.image_urls || [];

    if (file) {
      const url = await uploadImage(file, "marketplace");
      images = [url];
    }

    const availability = $("pavailability").value.trim().toLowerCase();
    const stock = availability.includes("commande")
      ? 0
      : Number(availability) > 0
        ? Number(availability)
        : 1;

    const record = {
      "Nom": name,
      "Description": $("pdesc").value.trim() || null,
      "Référence": currentProduct?.["Référence"] || null,
      "Prix": price,
      "Monnaie": $("pcurrency").value || "USD",
      category_id: categoryId,
      supplier_id: currentProduct?.supplier_id || null,
      stock_quantity: stock,
      image_urls: images,
      is_published: $("ppublished").checked
    };

    const result = currentProduct
      ? await db.from("products").update(record).eq("id", currentProduct.id)
      : await db.from("products").insert(record);

    if (result.error) throw result.error;

    message("productMsg", "Produit enregistré avec succès.");
    resetProductForm();
    await loadProducts();

  } catch (error) {
    message("productMsg", error.message, true);
  }
}

async function deleteProduct(id) {
  if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;

  const { error } = await db.from("products").delete().eq("id", id);

  if (error) {
    message("productMsg", error.message, true);
    return;
  }

  message("productMsg", "Produit supprimé.");
  await loadProducts();
}

/* PROJETS */

async function loadProjects() {
  const container = $("projectList");
  if (!container) return;

  container.textContent = "Chargement des projets...";

  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Erreur : " + error.message;
    return;
  }

  container.replaceChildren();

  if (!data?.length) {
    container.textContent = "Aucun projet enregistré.";
    return;
  }

  data.forEach((project) => {
    const card = document.createElement("div");
    card.className = "item";

    addText(card, "h3", project["Titre"]);
    addText(card, "p", project["Description"] || "");
    addText(card, "p", project["Emplacement"] || "");
    addText(card, "p", project["Catégorie"] || "");
    addText(card, "p", project.is_published ? "Publié" : "Non publié");

    const edit = document.createElement("button");
    edit.textContent = "Modifier";
    edit.type = "button";
    edit.addEventListener("click", () => editProject(project));
    card.appendChild(edit);

    const remove = document.createElement("button");
    remove.textContent = "Supprimer";
    remove.type = "button";
    remove.addEventListener("click", () => deleteProject(project.id));
    card.appendChild(remove);

    container.appendChild(card);
  });
}

function editProject(project) {
  currentProject = project;

  $("projectTitle").value = project["Titre"] || "";
  $("projectDesc").value = project["Description"] || "";
  $("projectPublished").checked = project.is_published;

  message("projectMsg", "Modification du projet sélectionné.");
  $("projectForm")?.scrollIntoView({ behavior: "smooth" });
}

async function saveProject(event) {
  event.preventDefault();

  try {
    const title = $("projectTitle").value.trim();

    if (!title) throw new Error("Le titre du projet est obligatoire.");

    let images = currentProject?.image_urls || [];
    const file = $("projectImage")?.files?.[0];

    if (file) {
      const url = await uploadImage(file, "projets");
      images = [url];
    }

    const record = {
      "Titre": title,
      "Description": $("projectDesc").value.trim() || null,
      "Emplacement": currentProject?.["Emplacement"] || null,
      "Catégorie": currentProject?.["Catégorie"] || null,
      image_urls: images,
      is_published: $("projectPublished").checked
    };

    const result = currentProject
      ? await db.from("projects").update(record).eq("id", currentProject.id)
      : await db.from("projects").insert(record);

    if (result.error) throw result.error;

    message("projectMsg", "Projet enregistré avec succès.");
    currentProject = null;
    $("projectForm").reset();
    await loadProjects();

  } catch (error) {
    message("projectMsg", error.message, true);
  }
}

async function deleteProject(id) {
  if (!confirm("Voulez-vous vraiment supprimer ce projet ?")) return;

  const { error } = await db.from("projects").delete().eq("id", id);

  if (error) {
    message("projectMsg", error.message, true);
    return;
  }

  message("projectMsg", "Projet supprimé.");
  await loadProjects();
}

/* AUTRES INFORMATIONS */

async function loadTable(table, elementId) {
  const container = $(elementId);
  if (!container) return;

  container.textContent = "Chargement...";

  const { data, error } = await db
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    container.textContent = "Erreur : " + error.message;
    return;
  }

  container.replaceChildren();

  if (!data?.length) {
    container.textContent = "Aucun élément enregistré.";
    return;
  }

  data.forEach((record) => {
    const card = document.createElement("div");
    card.className = "item";

    Object.entries(record).forEach(([key, value]) => {
      if (value === null) return;
      addText(
        card,
        "p",
        `${key} : ${typeof value === "object" ? JSON.stringify(value) : value}`
      );
    });

    container.appendChild(card);
  });
}

async function loadDashboard() {
  await loadCategories();

  await Promise.all([
    loadProducts(),
    loadProjects(),
    loadTable("supplier_applications", "suppliers"),
    loadTable("contact_messages", "inquiries"),
    loadTable("testimonials", "reviews")
  ]);
}

/* INITIALISATION */

$("loginBtn")?.addEventListener("click", login);
$("logout")?.addEventListener("click", logout);
$("productForm")?.addEventListener("submit", saveProduct);
$("projectForm")?.addEventListener("submit", saveProject);
$("resetProduct")?.addEventListener("click", resetProductForm);

async function checkSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    message("loginMsg", error.message, true);
    return;
  }

  const connected = !!data.session;
  showApp(connected);

  if (connected) await loadDashboard();
}

checkSession();
