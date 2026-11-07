/* NFG - Administration */

const db = window.supabase.createClient(
  window.NFG_SUPABASE_URL,
  window.NFG_SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

let categories = [];
let currentProduct = null;
let currentProject = null;

function message(id, text, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = error ? "#b42318" : "#18794e";
}

function showApp(connected) {
  $("login").classList.toggle("hidden", connected);
  $("app").classList.toggle("hidden", !connected);
}

function addText(parent, tag, value) {
  const el = document.createElement(tag);
  el.textContent = value ?? "";
  parent.appendChild(el);
  return el;
}

async function login() {
  const email = $("email").value.trim();
  const password = $("password").value;

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
  const allowed = ["jpg", "jpeg", "png", "webp"];

  if (!allowed.includes(extension)) {
    throw new Error("Format accepté : JPG, PNG ou WEBP.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("L'image dépasse la limite de 10 Mo.");
  }

  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from("NFG-images")
    .upload(path, file);

  if (error) throw error;

  const { data } = db.storage
    .from("NFG-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

/* CATEGORIES */

async function loadCategories() {
  const { data, error } = await db
    .from("categories")
    .select("id,name")
    .eq("is_active", true)
    .order("name");

  if (error) {
    message("productMsg", "Impossible de charger les catégories : " + error.message, true);
    return;
  }

  categories = data || [];
  const select = $("pcat");
  select.replaceChildren();

  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Choisir une catégorie";
  select.appendChild(first);

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
}

/* PRODUITS */

async function loadProducts() {
  const container = $("products");
  container.textContent = "Chargement...";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Erreur : " + error.message;
    return;
  }

  container.replaceChildren();

  if (!data.length) {
    container.textContent = "Aucun produit enregistré.";
    return;
  }

  data.forEach(product => {
    const card = document.createElement("div");
    card.className = "item";

    addText(card, "h3", product.name);
    addText(card, "p", `Prix : ${product.price ?? ""} ${product.currency || ""}`);
    addText(card, "p", `Référence : ${product.reference || "Non renseignée"}`);
    addText(card, "p", `Stock : ${product.stock_quantity}`);
    addText(card, "p", product.is_published ? "Publié" : "Non publié");

    if (product.image_urls?.length) {
      const img = document.createElement("img");
      img.src = product.image_urls[0];
      img.alt = product.name || "Photo du produit";
      card.appendChild(img);
    }

    const actions = document.createElement("div");
    actions.className = "actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Modifier";
    edit.addEventListener("click", () => editProduct(product));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Supprimer";
    remove.addEventListener("click", () => deleteProduct(product.id));

    actions.append(edit, remove);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function editProduct(product) {
  currentProduct = product;

  $("productId").value = product.id;
  $("pname").value = product.name || "";
  $("pcat").value = product.category_id || "";
  $("pprice").value = product.price ?? "";
  $("pcurrency").value = product.currency || "USD";
  $("preference").value = product.reference || "";
  $("pstock").value = product.stock_quantity ?? 0;
  $("pdesc").value = product.description || "";
  $("ppublished").checked = product.is_published;

  message("productMsg", "Produit chargé pour modification.");
  $("productForm").scrollIntoView({ behavior: "smooth" });
}

function resetProduct() {
  currentProduct = null;
  $("productForm").reset();
  $("productId").value = "";
  $("pstock").value = 1;
  message("productMsg", "");
}

async function saveProduct(event) {
  event.preventDefault();

  try {
    const name = $("pname").value.trim();
    const categoryId = $("pcat").value;
    const priceValue = $("pprice").value;
    const stock = Number($("pstock").value);

    if (!name || !categoryId) {
      throw new Error("Le nom et la catégorie sont obligatoires.");
    }

    if (priceValue !== "" && (!Number.isFinite(Number(priceValue)) || Number(priceValue) < 0)) {
      throw new Error("Le prix doit être un nombre positif.");
    }

    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error("La quantité en stock doit être un entier positif ou zéro.");
    }

    let images = currentProduct?.image_urls || [];
    const file = $("pimage").files[0];

    if (file) {
      const url = await uploadImage(file, "marketplace");
      images = [url];
    }

    const record = {
      name,
      category_id: categoryId,
      supplier_id: currentProduct?.supplier_id || null,
      description: $("pdesc").value.trim() || null,
      reference: $("preference").value.trim() || null,
      price: priceValue === "" ? null : Number(priceValue),
      currency: $("pcurrency").value,
      stock_quantity: stock,
      image_urls: images,
      is_published: $("ppublished").checked
    };

    const result = currentProduct
      ? await db.from("products").update(record).eq("id", currentProduct.id)
      : await db.from("products").insert(record);

    if (result.error) throw result.error;

    message("productMsg", "Produit enregistré avec succès.");
    resetProduct();
    await loadProducts();

  } catch (error) {
    message("productMsg", error.message, true);
  }
}

async function deleteProduct(id) {
  if (!confirm("Confirmer la suppression de ce produit ?")) return;

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
  container.textContent = "Chargement...";

  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "Erreur : " + error.message;
    return;
  }

  container.replaceChildren();

  if (!data.length) {
    container.textContent = "Aucun projet enregistré.";
    return;
  }

  data.forEach(project => {
    const card = document.createElement("div");
    card.className = "item";

    addText(card, "h3", project.title);
    addText(card, "p", project.description || "");
    addText(card, "p", `Emplacement : ${project.location || "Non renseigné"}`);
    addText(card, "p", `Catégorie : ${project.category || "Non renseignée"}`);
    addText(card, "p", project.is_published ? "Publié" : "Non publié");

    if (project.image_urls?.length) {
      const img = document.createElement("img");
      img.src = project.image_urls[0];
      img.alt = project.title || "Photo du projet";
      card.appendChild(img);
    }

    const actions = document.createElement("div");
    actions.className = "actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Modifier";
    edit.addEventListener("click", () => editProject(project));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Supprimer";
    remove.addEventListener("click", () => deleteProject(project.id));

    actions.append(edit, remove);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function editProject(project) {
  currentProject = project;

  $("projectId").value = project.id;
  $("projectTitle").value = project.title || "";
  $("projectLocation").value = project.location || "";
  $("projectCategory").value = project.category || "";
  $("projectDesc").value = project.description || "";
  $("projectPublished").checked = project.is_published;

  message("projectMsg", "Projet chargé pour modification.");
  $("projectForm").scrollIntoView({ behavior: "smooth" });
}

function resetProject() {
  currentProject = null;
  $("projectForm").reset();
  $("projectId").value = "";
  message("projectMsg", "");
}

async function saveProject(event) {
  event.preventDefault();

  try {
    const title = $("projectTitle").value.trim();
    if (!title) throw new Error("Le titre du projet est obligatoire.");

    let images = currentProject?.image_urls || [];
    const file = $("projectImage").files[0];

    if (file) {
      const url = await uploadImage(file, "projets");
      images = [url];
    }

    const record = {
      title,
      description: $("projectDesc").value.trim() || null,
      location: $("projectLocation").value.trim() || null,
      category: $("projectCategory").value.trim() || null,
      image_urls: images,
      is_published: $("projectPublished").checked
    };

    const result = currentProject
      ? await db.from("projects").update(record).eq("id", currentProject.id)
      : await db.from("projects").insert(record);

    if (result.error) throw result.error;

    message("projectMsg", "Projet enregistré avec succès.");
    resetProject();
    await loadProjects();

  } catch (error) {
    message("projectMsg", error.message, true);
  }
}

async function deleteProject(id) {
  if (!confirm("Confirmer la suppression de ce projet ?")) return;

  const { error } = await db.from("projects").delete().eq("id", id);

  if (error) {
    message("projectMsg", error.message, true);
    return;
  }

  message("projectMsg", "Projet supprimé.");
  await loadProjects();
}

/* CANDIDATURES, CONTACTS ET AVIS */

async function loadTable(table, elementId) {
  const container = $(elementId);
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

  if (!data.length) {
    container.textContent = "Aucun élément enregistré.";
    return;
  }

  data.forEach(record => {
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

/* CHARGEMENT GENERAL */

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

/* EVENEMENTS */

$("loginBtn").addEventListener("click", login);
$("logout").addEventListener("click", logout);
$("productForm").addEventListener("submit", saveProduct);
$("projectForm").addEventListener("submit", saveProject);
$("resetProduct").addEventListener("click", resetProduct);
$("resetProject").addEventListener("click", resetProject);

async function checkSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    message("loginMsg", error.message, true);
    return;
  }

  showApp(!!data.session);

  if (data.session) {
    await loadDashboard();
  }
}

checkSession();
