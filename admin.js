const db = supabase.createClient(
  window.NFG_SUPABASE_URL,
  window.NFG_SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);

function showMessage(id, text, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = error ? "#b42318" : "#18794e";
}

function showApp(connected) {
  $("login")?.classList.toggle("hidden", connected);
  $("app")?.classList.toggle("hidden", !connected);
}

async function login() {
  const email = $("email").value.trim();
  const password = $("password").value;

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage("loginMsg", error.message, true);
    return;
  }

  showMessage("loginMsg", "Connexion réussie.");
  showApp(true);
  await loadDashboard();
}

async function logout() {
  const { error } = await db.auth.signOut();
  if (error) {
    alert(error.message);
    return;
  }
  showApp(false);
}

async function loadList(table, elementId, fields) {
  const container = $(elementId);
  if (!container) return;

  container.textContent = "Chargement...";

  const { data, error } = await db
    .from(table)
    .select(fields)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    container.textContent = "Accès non disponible : " + error.message;
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

async function loadDashboard() {
  await Promise.all([
    loadList(
      "products",
      "products",
      "*"
    ),
    loadList(
      "projects",
      "projectList",
      "*"
    ),
    loadList(
      "supplier_applications",
      "suppliers",
      "*"
    ),
    loadList(
      "contact_messages",
      "inquiries",
      "*"
    ),
    loadList(
      "testimonials",
      "reviews",
      "*"
    )
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

  if (connected) {
    await loadDashboard();
  }
}

$("loginBtn")?.addEventListener("click", login);
$("logout")?.addEventListener("click", logout);

checkSession();
