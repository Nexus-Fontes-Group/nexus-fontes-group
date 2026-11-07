const db = window.supabase.createClient(
  window.NFG_SUPABASE_URL,
  window.NFG_SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);

function showMessage(id, text, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = text;
  element.style.color = error ? "#b42318" : "#18794e";
}

function showApp(connected) {
  $("login")?.classList.toggle("hidden", connected);
  $("app")?.classList.toggle("hidden", !connected);
}

async function login() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    showMessage("loginMsg", "Veuillez remplir les deux champs.", true);
    return;
  }

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage("loginMsg", error.message, true);
    return;
  }

  showApp(true);
  await loadDashboard();
}

async function logout() {
  const { error } = await db.auth.signOut();
  if (error) {
    showMessage("loginMsg", error.message, true);
    return;
  }
  showApp(false);
}

async function loadTable(table, elementId) {
  const container = $(elementId);
  if (!container) return;

  container.textContent = "Chargement...";

  const { data, error } = await db
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    container.textContent = "Chargement impossible : " + error.message;
    return;
  }

  container.replaceChildren();

  if (!data || data.length === 0) {
    container.textContent = "Aucun élément enregistré.";
    return;
  }

  data.forEach((record) => {
    const card = document.createElement("div");
    card.className = "item";

    Object.entries(record).forEach(([key, value]) => {
      if (value === null || value === undefined) return;

      const line = document.createElement("p");
      line.textContent = `${key} : ${
        typeof value === "object" ? JSON.stringify(value) : value
      }`;
      card.appendChild(line);
    });

    container.appendChild(card);
  });
}

async function loadProducts() {
  const container = $("products");
  if (!container) return;

  container.textContent = "Chargement des produits...";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    container.textContent = "Erreur produits : " + error.message;
    return;
  }

  container.replaceChildren();

  (data || []).forEach((product) => {
    const card = document.createElement("div");
    card.className = "item";

    const title = document.createElement("strong");
    title.textContent = product["Nom"] || "Produit";
    card.appendChild(title);

    const details = document.createElement("p");
    details.textContent =
      `${product["Prix"] ?? ""} ${product["Monnaie"] ?? ""}`;
    card.appendChild(details);

    const description = document.createElement("p");
    description.textContent = product["Description"] || "";
    card.appendChild(description);

    container.appendChild(card);
  });
}

async function loadProjects() {
  const container = $("projectList");
  if (!container) return;

  container.textContent = "Chargement des projets...";

  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    container.textContent = "Erreur projets : " + error.message;
    return;
  }

  container.replaceChildren();

  (data || []).forEach((project) => {
    const card = document.createElement("div");
    card.className = "item";

    const title = document.createElement("strong");
    title.textContent = project.title || "Projet";
    card.appendChild(title);

    const description = document.createElement("p");
    description.textContent = project.description || "";
    card.appendChild(description);

    container.appendChild(card);
  });
}

async function loadDashboard() {
  await Promise.all([
    loadProducts(),
    loadProjects(),
    loadTable("supplier_applications", "suppliers"),
    loadTable("contact_messages", "inquiries"),
    loadTable("testimonials", "reviews")
  ]);
}

async function checkSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    showMessage("loginMsg", error.message, true);
    return;
  }

  const connected = !!data.session;
  showApp(connected);

  if (connected) await loadDashboard();
}

$("loginBtn")?.addEventListener("click", login);
$("logout")?.addEventListener("click", logout);

checkSession();
