(() => {
  const $ = (s) => document.querySelector(s);
  $('#year').textContent = new Date().getFullYear();

  document.querySelectorAll('.links a').forEach(a =>
    a.addEventListener('click', () => $('.links').classList.remove('open'))
  );

  const configured = window.NFG_SUPABASE_URL &&
    !window.NFG_SUPABASE_URL.includes('VOTRE-PROJET') &&
    window.NFG_SUPABASE_ANON_KEY &&
    !window.NFG_SUPABASE_ANON_KEY.includes('VOTRE_CLE');

  const db = configured && window.supabase
    ? window.supabase.createClient(window.NFG_SUPABASE_URL, window.NFG_SUPABASE_ANON_KEY)
    : null;

  const msg = (id, text, bad = false) => {
    const el = $(id);
    if (el) {
      el.textContent = text;
      el.style.color = bad ? '#a12b2b' : '#246b45';
    }
  };

  if (!db) {
    $('#catalogue-produits').innerHTML =
      '<p>Le catalogue sera affiché après activation de la connexion sécurisée.</p>';
    $('#projets-dynamiques').innerHTML =
      '<p>Les projets publiés apparaîtront ici.</p>';
  } else {
    (async () => {
      const { data: products } = await db.from('products')
        .select('*').eq('published', true)
        .order('created_at', { ascending: false });

      $('#catalogue-produits').innerHTML = products?.length
        ? products.map(p => `
          <article class="product-card">
            ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : ''}
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.description || '')}</p>
            <p>${p.price != null ? Number(p.price).toLocaleString('fr-FR') + ' ' + esc(p.currency || 'USD') : 'Prix sur demande'}</p>
            <p>${esc(p.availability || 'Disponibilité à confirmer')}</p>
            <button class="btn" data-order="${p.id}">Demander ce produit →</button>
          </article>
        `).join('')
        : '<p>Aucun produit publié pour le moment. Contactez NFG.</p>';

      $('#catalogue-produits').querySelectorAll('[data-order]')
        .forEach(b => b.addEventListener('click', () => {
          const p = products.find(x => x.id === b.dataset.order);
          $('#contact-form [name="Sujet"]').value = 'Demande de produit : ' + p.name;
          $('#contact-form [name="Message"]').value = 'Je souhaite obtenir des informations sur : ' + p.name;
          location.hash = 'contact';
        }));

      const { data: projects } = await db.from('projects')
        .select('*').eq('published', true)
        .order('created_at', { ascending: false });

      $('#projets-dynamiques').innerHTML = projects?.length
        ? projects.map(p => `
          <article class="gallery-item">
            ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}">` : ''}
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.description || '')}</p>
          </article>
        `).join('')
        : '<p>Découvrez nos projets en contactant NFG.</p>';

      const { data: reviews } = await db.from('reviews')
        .select('*').eq('published', true)
        .order('created_at', { ascending: false }).limit(6);

      $('#avis-publies').innerHTML = reviews?.map(r => `
        <blockquote>
          <strong>${esc(r.author_name)}</strong> · ${'★'.repeat(r.rating)}
          <p>${esc(r.content)}</p>
        </blockquote>
      `).join('') || '<p>Les témoignages vérifiés apparaîtront ici.</p>';
    })().catch(() => {});

    $('#supplier-form').addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      const { error } = await db.from('supplier_applications').insert(d);
      msg('#supplier-feedback',
        error ? 'Envoi impossible. Réessayez plus tard.' : 'Candidature envoyée. NFG vous recontactera.',
        !!error
      );
      if (!error) e.currentTarget.reset();
    });

    $('#review-form').addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      d.rating = Number(d.rating);
      const { error } = await db.from('reviews').insert(d);
      msg('#review-feedback',
        error ? 'Envoi impossible. Réessayez.' : 'Merci. Votre témoignage sera vérifié avant publication.',
        !!error
      );
      if (!error) e.currentTarget.reset();
    });

    $('#contact-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const { error } = await db.from('inquiries').insert({
        name: f.Nom, email: f.Email, subject: f.Sujet, message: f.Message
      });
      msg('#contact-feedback',
        error ? 'Votre demande n’a pas pu être envoyée.' : 'Votre demande a bien été transmise à NFG.',
        !!error
      );
      if (!error) e.currentTarget.reset();
    });
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
  }
})();
