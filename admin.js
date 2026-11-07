/* =====================================================
   NFG - ADMINISTRATION
   Produits, projets, fournisseurs, contacts et avis
===================================================== */

const db = window.supabase.createClient(
  window.NFG_SUPABASE_URL,
  window.NFG_SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);

let currentProducts = [];
let currentProjects = [];

function message(id, text, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = error ? "#b42318" : "#18794e";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showApp(session) {
  $("login")?.classList.toggle("hidden", !!session);
  $("app")?.classList.toggle("hidden", !session);

  if (session) {
    loadCategories();
    loadProducts();
    loadProjects();
    loadOtherSections();
  }
}

/* CONNEXION */

$("loginBtn")?.addEventListener("click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    message("loginMsg", "Saisis ton e-mail et ton mot de passe.", true);
    return;
  }

  message("loginMsg", "Connexion en cours...");

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message("loginMsg", error.message, true);
    return;
  }

  message("loginMsg", "Connexion réussie.");
  showApp(data.session);
});

$("logout")?.addEventListener("click", async () => {
  await db.auth.signOut();
  showApp(null);
});

/* CATÉGORIES */

async function loadCategories() {
  const field = $("pcat");
  if (!field || field.tagName !== "SELECT") return;

  const { data, error } = await db
    .from("categories")
    .select("id,name")
    .eq("is_active", true)
    .order("name");

  if (error) {
    message("productMsg", "Impossible de charger les catégories : " + error.message, true);
    return;
  }

  const previous = field.value;
  field.innerHTML = '<option value="">Choisir une catégorie</option>';

  (data || []).forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    field.appendChild(option);
  });

  if (previous) field.value = previous;
}

async function getCategoryId() {
  const field = $("pcat");
  if (!field || !field.value.trim()) return null;

  if (field.tagName === "SELECT") return field.value;

  const { data, error } = await db
    .from("categories")
    .select("id")
    .ilike("name", field.value.trim())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

/* PHOTOS */

async function uploadPhoto(file, folder) {
  if (!file) return null;

  const extension = file.name.split(".").pop().toLowerCase();
  const allowed = ["jpg", "jpeg", "png", "webp", "svg"];

  if (!allowed.includes(extension)) {
    throw new Error("Format de photo non autorisé.");
  }

  const fileName =
    folder + "/" + Date.now() + "-" +
    Math.random().toString(36).slice(2) + "." + extension;

  const { error } = await db.storage
    .from("NFG-images")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = db.storage
    .from("NFG-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
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

  currentProducts = data || [];

  if (!currentProducts.length) {
    container.textContent = "Aucun produit enregistré.";
    return;
  }

  container.innerHTML = currentProducts.map((p) => {
    const name = p.name ?? p.Nom ?? "Produit sans nom";
    const images = Array.isArray(p.image_urls) ? p.image_urls : [];
    const image = images[0] || "";

    return `
      <div class="item">
        ${image ? `<img src="${escapeHTML(image)}" alt="">` : ""}
        <h3>${escapeHTML(name)}</h3>
        <p>${escapeHTML(p.description ?? p.Description ?? "")}</p>
        <p>Prix : ${escapeHTML(p.price ?? p.Prix ?? "Non précisé")}
        ${escapeHTML(p.currency ?? p.Monnaie ?? "USD")}</p>
        <p>Statut : ${p.is_published ? "Publié" : "Non publié"}</p>
        <button type="button" onclick="editProduct('${p.id}')">Modifier</button>
        <button type="button" class="secondary" onclick="deleteProduct('${p.id}')">Supprimer</button>
      </div>
    `;
  }).join("");
}

$("productForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = $("productId")?.value;
  const name = $("pname")?.value.trim();

  if (!name) {
    message("productMsg", "Le nom du produit est obligatoire.", true);
    return;
  }

  message("productMsg", "Enregistrement en cours...");

  try {
    const categoryId = await getCategoryId();
    const oldProduct = currentProducts.find((p) => p.id === id);

    let images = oldProduct?.image_urls || [];
    const file = $("pimage")?.files?.[0];

    if (file) {
      const url = await uploadPhoto(file, "marketplace");
      images = [url];
    }

    const product = {
      name,
      description: $("pdesc")?.value.trim() || "",
      price: $("pprice")?.value ? Number($("pprice").value) : null,
      currency: $("pcurrency")?.value || "USD",
      category_id: categoryId,
      reference: oldProduct?.reference || null,
      stock_quantity: oldProduct?.stock_quantity ?? 1,
      image_urls: images,
      is_published: $("ppublished")?.checked ?? true
    };

    let result;

    if (id) {
      result = await db.from("products").update(product).eq("id", id);
    } else {
      result = await db.from("products").insert(product);
    }

    if (result.error) throw result.error;

    message("productMsg", "Produit enregistré avec succès.");
    $("productForm").reset();
    if ($("productId")) $("productId").value = "";
    await loadProducts();

  } catch (error) {
    message("productMsg", "Erreur : " + error.message, true);
  }
});

window.editProduct = function(id) {
  const p = currentProducts.find((item) => item.id === id);
  if (!p) return;

  $("productId").value = p.id;
  $("pname").value = p.name ?? p.Nom ?? "";
  $("pprice").value = p.price ?? p.Prix ?? "";
  $("pcurrency").value = p.currency ?? p.Monnaie ?? "USD";
  $("pdesc").value = p.description ?? p.Description ?? "";

  if ($("pcat")?.tagName === "SELECT") {
    $("pcat").value = p.category_id || "";
  }

  if ($("ppublished")) $("ppublished").checked = !!p.is_published;

  message("productMsg", "Produit chargé. Tu peux le modifier.");
  $("productForm").scrollIntoView({ behavior: "smooth" });
};

window.deleteProduct = async function(id) {
  if (!confirm("Supprimer définitivement ce produit ?")) return;

  const { error } = await db.from("products").delete().eq("id", id);

  if (error) {
    message("productMsg", error.message, true);
    return;
  }

  message("productMsg", "Produit supprimé.");
  await loadProducts();
};

$("resetProduct")?.addEventListener("click", () => {
  $("productForm")?.reset();
  if ($("productId")) $("productId").value = "";
  message("productMsg", "");
});

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

  currentProjects = data || [];

  if (!currentProjects.length) {
    container.textContent = "Aucun projet enregistré.";
    return;
  }

  container.innerHTML = currentProjects.map((p) => {
    const images = Array.isArray(p.image_urls) ? p.image_urls : [];

    return `
      <div class="item">
        ${images[0] ? `<img src="${escapeHTML(images[0])}" alt="">` : ""}
        <h3>${escapeHTML(p.title ?? p.Titre ?? "")}</h3>
        <p>${escapeHTML(p.description ?? p.Description ?? "")}</p>
        <p>${escapeHTML(p.location ?? p.Emplacement ?? "")}</p>
        <p>${p.is_published ? "Publié" : "Non publié"}</p>
        <button type="button" onclick="editProject('${p.id}')">Modifier</button>
        <button type="button" class="secondary" onclick="deleteProject('${p.id}')">Supprimer</button>
      </div>
    `;
  }).join("");
}

function projectIdField() {
  let field = $("projectId");

  if (!field && $("projectForm")) {
    field = document.createElement("input");
    field.type = "hidden";
    field.id = "projectId";
    $("projectForm").prepend(field);
  }

  return field;
}

$("projectForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = $("projectTitle")?.value.trim();

  if (!title) {
    message("projectMsg", "Le titre du projet est obligatoire.", true);
    return;
  }

  message("projectMsg", "Enregistrement du projet...");

  try {
    const id = projectIdField()?.value;
    const oldProject = currentProjects.find((p) => p.id === id);

    let images = oldProject?.image_urls || [];
    const file = $("projectImage")?.files?.[0];

    if (file) {
      const url = await uploadPhoto(file, "projets");
      images = [url];
    }

    const project = {
      title,
      description: $("projectDesc")?.value.trim() || "",
      location: $("projectLocation")?.value.trim() || oldProject?.location || "",
      category: $("projectCategory")?.value.trim() || oldProject?.category || "",
      image_urls: images,
      is_published: $("projectPublished")?.checked ?? true
    };

    let result;

    if (id) {
      result = await db.from("projects").update(project).eq("id", id);
    } else {
      result = await db.from("projects").insert(project);
    }

    if (result.error) throw result.error;

    message("projectMsg", "Projet enregistré avec succès.");
    $("projectForm").reset();
    if (projectIdField()) projectIdField().value = "";
    await loadProjects();

  } catch (error) {
    message("projectMsg", "Erreur : " + error.message, true);
  }
});

window.editProject = function(id) {
  const p = currentProjects.find((item) => item.id === id);
  if (!p) return;

  projectIdField().value = p.id;
  $("projectTitle").value = p.title ?? p.Titre ?? "";
  $("projectDesc").value = p.description ?? p.Description ?? "";

  if ($("projectLocation")) {
    $("projectLocation").value = p.location ?? p.Emplacement ?? "";
  }

  if ($("projectCategory")) {
    $("projectCategory").value = p.category ?? p.Catégorie ?? "";
  }

  if ($("projectPublished")) {
    $("projectPublished").checked = !!p.is_published;
  }

  message("projectMsg", "Projet chargé. Tu peux le modifier.");
  $("projectForm").scrollIntoView({ behavior: "smooth" });
};

window.deleteProject = async function(id) {
  if (!confirm("Supprimer définitivement ce projet ?")) return;

  const { error } = await db.from("projects").delete().eq("id", id);

  if (error) {
    message("projectMsg", error.message, true);
    return;
  }

  message("projectMsg", "Projet supprimé.");
  await loadProjects();
};

/* AUTRES RUBRIQUES */

async function loadOtherSections() {
  await loadSimpleList(
    "supplier_applications",
    "suppliers",
    ["company_name", "contact_name", "email", "telephone", "adresse", "message"]
  );

  await loadSimpleList(
    "contact_messages",
    "inquiries",
    ["name", "email", "phone", "subject", "message"]
  );

  await loadSimpleList(
    "testimonials",
    "reviews",
    ["customer_name", "content", "rating"]
  );
}

async function loadSimpleList(table, elementId, fields) {
  const container = $(elementId);
  if (!container) return;

  const { data, error } = await db
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    container.textContent = "Consultation non autorisée ou erreur : " + error.message;
    return;
  }

  if (!data?.length) {
    container.textContent = "Aucun élément enregistré.";
    return;
  }

  container.innerHTML = data.map((item) => `
    <div class="item">
      ${fields.map((field) => item[field] ? `
        <p><strong>${escapeHTML(field)} :</strong>
        ${escapeHTML(item[field])}</p>
      ` : "").join("")}
    </div>
  `).join("");
}

/* RESTAURATION DE SESSION */

db.auth.onAuthStateChange((_event, session) => {
  showApp(session);
});

db.auth.getSession().then(({ data }) => {
  showApp(data.session);
});
