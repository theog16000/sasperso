const STORAGE_KEY = "ensemble-association-atlas-v2";
const defaultSettings = {
  membershipFee: 45,
  currency: "EUR",
  fiscalYearStartMonth: 9,
  transactionCategories: ["Cotisations", "Subventions", "Dons", "Événements", "Matériel", "Communication", "Assurance", "Autre"],
  memberRoles: ["Membre", "Président", "Trésorier", "Secrétaire", "Bénévole"]
};
const currencies = ["EUR", "CHF", "CAD", "USD", "GBP"];
const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const relativeDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const exerciseLabel = () => {
  const now = new Date();
  const year = now.getMonth() >= settings.fiscalYearStartMonth - 1 ? now.getFullYear() : now.getFullYear() - 1;
  return `Exercice ${year}–${year + 1}`;
};
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let profile = null;
let data = { transactions: [], members: [], budgets: [] };
let settings = { ...defaultSettings, transactionCategories: [...defaultSettings.transactionCategories], memberRoles: [...defaultSettings.memberRoles] };
let euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: settings.currency });
let currentPage = "dashboard";
let transactionFilter = "all";
let searchQuery = "";
let memberQuery = "";
let modalMode = "transaction";

const pageTitles = { dashboard: "Vue d'ensemble", treasury: "Trésorerie", members: "Membres", budgets: "Budgets", reports: "Rapports", profile: "Mon profil" };
const icons = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
};

function toast(message, isError = false) {
  const element = document.createElement("div");
  element.className = `toast${isError ? " error" : ""}`;
  element.textContent = message;
  document.querySelector("#toast-region").append(element);
  window.setTimeout(() => element.remove(), 3400);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function initials(name) {
  return String(name).trim().split(/[\s.@]+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "ME";
}

function associationName() {
  return profile?.association_name?.trim() || "Mon association";
}

function currencyUnit() {
  return euro.formatToParts(0).find((part) => part.type === "currency")?.value || settings.currency;
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object") return { ...defaultSettings, transactionCategories: [...defaultSettings.transactionCategories], memberRoles: [...defaultSettings.memberRoles] };
  return {
    membershipFee: Number(value.membershipFee ?? defaultSettings.membershipFee),
    currency: value.currency || defaultSettings.currency,
    fiscalYearStartMonth: Number(value.fiscalYearStartMonth ?? defaultSettings.fiscalYearStartMonth),
    transactionCategories: [...(value.transactionCategories || defaultSettings.transactionCategories)],
    memberRoles: [...(value.memberRoles || defaultSettings.memberRoles)]
  };
}

function setSettings(value) {
  settings = normalizeSettings(value);
  euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: settings.currency });
}

function sumTransactions(type) {
  return data.transactions.filter((item) => item.type === type && item.status === "Réglé").reduce((sum, item) => sum + Number(item.amount), 0);
}

function balance() {
  return Number(profile?.opening_balance || 0) + sumTransactions("income") - sumTransactions("expense");
}

function saveWorkspace() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, settings, ...data }));
    const notice = document.querySelector("#storage-notice");
    notice?.classList.remove("storage-warning");
    if (notice) notice.textContent = "Vos données sont enregistrées sur cet appareil.";
    return true;
  } catch (error) {
    console.error("Impossible d’enregistrer les données localement.", error);
    const notice = document.querySelector("#storage-notice");
    notice?.classList.add("storage-warning");
    if (notice) notice.textContent = "Enregistrement impossible. Exportez une sauvegarde avant de continuer.";
    toast("Sauvegarde locale impossible. Vérifiez l’espace disponible sur cet appareil.", true);
    return false;
  }
}

function loadWorkspace() {
  let saved;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Le stockage local du navigateur est inaccessible.", error);
    showSetup();
    toast("Le stockage local est indisponible. Autorisez les données du site dans votre navigateur.", true);
    return;
  }
  if (!saved) {
    showSetup();
    return;
  }
  try {
    const workspace = JSON.parse(saved);
    if (!isValidWorkspace(workspace)) {
      throw new Error("La sauvegarde de l’espace associatif est incomplète.");
    }
    profile = {
      full_name: String(workspace.profile.full_name),
      email: String(workspace.profile.email || ""),
      association_name: String(workspace.profile.association_name || "Mon association"),
      opening_balance: Number(workspace.profile.opening_balance || 0)
    };
    data = {
      transactions: workspace.transactions,
      members: workspace.members,
      budgets: workspace.budgets
    };
    setSettings(workspace.settings);
    showApp();
  } catch (error) {
    console.error("La sauvegarde de l’espace associatif est invalide.", error);
    showSetup();
    toast("La sauvegarde locale ne peut pas être lue. Vous pouvez importer une sauvegarde existante.", true);
  }
}

function isValidWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object" || typeof workspace.profile?.full_name !== "string" || !workspace.profile.full_name.trim()) return false;
  if (!Number.isFinite(Number(workspace.profile.opening_balance || 0))) return false;
  if (!Array.isArray(workspace.transactions) || !Array.isArray(workspace.members) || !Array.isArray(workspace.budgets)) return false;
  const validText = (value) => typeof value === "string";
  const validDate = (value) => validText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (workspace.settings) {
    const value = workspace.settings;
    if (!Number.isFinite(Number(value.membershipFee)) || Number(value.membershipFee) < 0
      || !currencies.includes(value.currency)
      || !Number.isInteger(Number(value.fiscalYearStartMonth)) || Number(value.fiscalYearStartMonth) < 1 || Number(value.fiscalYearStartMonth) > 12
      || !Array.isArray(value.transactionCategories) || !value.transactionCategories.length || !value.transactionCategories.every((item) => validText(item) && item.trim())
      || !Array.isArray(value.memberRoles) || !value.memberRoles.length || !value.memberRoles.every((item) => validText(item) && item.trim())) return false;
  }
  return workspace.transactions.every((item) => item && validText(item.title) && validText(item.category) && validDate(item.date) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 && ["income", "expense"].includes(item.type) && ["Réglé", "En attente"].includes(item.status))
    && workspace.members.every((item) => item && validText(item.name) && validText(item.email) && validText(item.role) && validDate(item.joined) && ["Actif", "Inactif"].includes(item.status))
    && workspace.budgets.every((item) => item && validText(item.name) && validText(item.description) && validText(item.category) && Number.isFinite(Number(item.limit)) && Number(item.limit) > 0);
}

function showSetup() {
  document.querySelector("#app-shell").hidden = true;
  document.querySelector("#setup-screen").hidden = false;
}

function showApp() {
  document.querySelector("#setup-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
  render();
}

function finishSetup(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const fullName = String(form.get("full_name") || "").trim();
  const name = String(form.get("association_name") || "").trim();
  const openingBalance = Number(form.get("opening_balance") || 0);
  if (!fullName || !name || !Number.isFinite(openingBalance)) {
    return toast("Renseignez votre nom, celui de votre association et un solde valide.", true);
  }
  profile = {
    full_name: fullName,
    email: String(form.get("email") || "").trim(),
    association_name: name,
    opening_balance: openingBalance
  };
  data = { transactions: [], members: [], budgets: [] };
  setSettings(defaultSettings);
  if (!saveWorkspace()) return;
  currentPage = "dashboard";
  showApp();
  toast("Votre espace associatif est prêt !");
}

function render() {
  document.querySelector("#breadcrumb-current").textContent = pageTitles[currentPage];
  document.querySelector("#exercise-period").textContent = exerciseLabel();
  document.querySelector("#workspace-name").textContent = associationName();
  document.querySelector("#breadcrumb-association").textContent = associationName();
  document.querySelector("#sidebar-name").textContent = profile.full_name;
  document.querySelector("#sidebar-role").textContent = profile.email || "Profil local";
  document.querySelector("#sidebar-avatar").textContent = initials(profile.full_name);
  document.querySelector("#top-avatar").textContent = initials(profile.full_name);
  document.querySelector("#modal-organization").textContent = associationName().toUpperCase();
  document.querySelector("#transaction-count").textContent = data.transactions.length;
  const renderers = { dashboard: renderDashboard, treasury: renderTreasury, members: renderMembers, budgets: renderBudgets, reports: renderReports, profile: renderProfile };
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === currentPage));
  document.querySelector("#page-content").innerHTML = renderers[currentPage]();
  bindPageActions();
}

function heading(title, subtitle, actions = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function actionButton(label, action, icon = "plus", quiet = false) {
  return `<button class="button ${quiet ? "button-quiet" : "button-primary"}" data-action="${action}">${icons[icon]}${label}</button>`;
}

function metric(label, value, note, symbol, positive = false) {
  return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${symbol}</span></div><div class="metric-value">${value}</div><div class="metric-foot${positive ? " positive" : ""}">${note}</div></article>`;
}

function chartMarkup() {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const transactions = data.transactions.filter((item) => item.status === "Réglé" && item.date.startsWith(key));
    return {
      label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date),
      income: transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0),
      expense: transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0)
    };
  });
  const maximum = Math.max(100, ...months.flatMap((month) => [month.income, month.expense]));
  const step = Math.max(100, Math.ceil(maximum / 3 / 100) * 100);
  const yFor = (value) => 146 - (value / (step * 3)) * 120;
  const path = (property) => months.map((month, index) => `${index ? "L" : "M"}${48 + index * 108} ${yFor(month[property])}`).join(" ");
  const incomePath = path("income");
  const grid = [0, 1, 2, 3].map((index) => {
    const y = 146 - index * 40;
    return `<line class="chart-grid-line" x1="38" y1="${y}" x2="610" y2="${y}"/><text class="chart-label" x="0" y="${y + 3}">${euro.format(index * step).replace(/,00 €$/, " €")}</text>`;
  }).join("");
  const labels = months.map((month, index) => `<text class="chart-label" x="${40 + index * 108}" y="174">${escapeHtml(month.label)}</text>`).join("");
  return `<div class="chart-wrap"><svg viewBox="0 0 620 190" preserveAspectRatio="none" role="img" aria-label="Entrées et sorties mensuelles sur les six derniers mois"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#399676" stop-opacity=".14"/><stop offset="1" stop-color="#399676" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-fill" d="${incomePath} L588 146 L48 146Z"/><path class="chart-line-income" d="${incomePath}"/><path class="chart-line-expense" d="${path("expense")}"/>${labels}</svg></div>`;
}

function dateLabel(value, formatter = fullDate) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : formatter.format(date);
}

function transactionRows(items, limit = items.length) {
  const rows = items.slice(0, limit).map((item) => `<tr><td class="transaction-name"><span class="transaction-symbol ${item.type === "expense" ? "expense" : ""}">${escapeHtml(item.title.trim().charAt(0).toUpperCase() || "•")}</span>${escapeHtml(item.title)}</td><td class="transaction-category">${escapeHtml(item.category)}</td><td>${dateLabel(item.date, shortDate)}</td><td class="${item.type === "income" ? "amount-income" : "amount-expense"}">${item.type === "income" ? "+" : "−"} ${euro.format(Number(item.amount))}</td><td><span class="status-pill${item.status === "En attente" ? " pending" : ""}">${escapeHtml(item.status)}</span></td></tr>`).join("");
  return rows || `<tr><td colspan="5"><div class="empty-state">Aucune opération enregistrée.</div></td></tr>`;
}

function transactionPanel(items, withActions = true) {
  const filters = withActions ? `<div class="table-toolbar"><label class="toolbar-search">${icons.search}<span class="sr-only">Rechercher une opération</span><input id="transaction-search" placeholder="Rechercher" value="${escapeHtml(searchQuery)}" /></label><div class="filter-tabs" aria-label="Filtrer les opérations"><button data-filter="all" class="${transactionFilter === "all" ? "active" : ""}">Tout</button><button data-filter="income" class="${transactionFilter === "income" ? "active" : ""}">Entrées</button><button data-filter="expense" class="${transactionFilter === "expense" ? "active" : ""}">Sorties</button></div></div>` : "";
  return `<section class="panel lower-panel"><div class="panel-heading"><div><h2>Dernières opérations</h2><div class="panel-subtitle">${items.length} opération${items.length > 1 ? "s" : ""} enregistrée${items.length > 1 ? "s" : ""}</div></div>${withActions ? `<button class="text-action" data-page-link="treasury">Voir tout ${icons.arrow}</button>` : ""}</div>${filters}<div class="table-wrap"><table class="transaction-table"><thead><tr><th>OPÉRATION</th><th>CATÉGORIE</th><th>DATE</th><th>MONTANT</th><th>STATUT</th></tr></thead><tbody>${transactionRows(items)}</tbody></table></div>${withActions ? "" : `<div class="table-footer">Données enregistrées dans le navigateur.</div>`}</section>`;
}

function renderDashboard() {
  const incomes = sumTransactions("income");
  const expenses = sumTransactions("expense");
  const memberCount = data.members.filter((member) => member.status === "Actif").length;
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
  return `${heading(`Bonjour ${escapeHtml(profile.full_name.split(" ")[0])} 👋`, "Voici le résumé de la vie de votre association.", actionButton("Nouvelle opération", "new-transaction"))}
    <section class="overview-banner"><div><div class="banner-label">Solde de trésorerie</div><div class="banner-total">${euro.format(balance())}</div><div class="banner-note">${escapeHtml(associationName())} · Compte principal</div></div><div class="banner-right"><div class="banner-label">Trésorerie disponible</div><strong>${balance() >= 0 ? "Situation saine" : "Solde à surveiller"}</strong><div class="banner-positive">Solde de départ : ${euro.format(Number(profile.opening_balance || 0))}</div></div></section>
    <section class="metric-grid">${metric("Entrées · exercice", euro.format(incomes), "Cotisations, dons et subventions", "↗", true)}${metric("Sorties · exercice", euro.format(expenses), "Dépenses réglées", "↘")}${metric("Membres actifs", String(memberCount), `${data.members.length - memberCount} membre${data.members.length - memberCount === 1 ? "" : "s"} inactif${data.members.length - memberCount === 1 ? "" : "s"}`, "♧", true)}${metric("Opérations à suivre", String(data.transactions.filter((item) => item.status === "En attente").length), "En attente de règlement", "◷")}</section>
    <section class="dashboard-grid"><article class="panel"><div class="panel-heading"><div><h2>Évolution de la trésorerie</h2><div class="panel-subtitle">Entrées et sorties · 6 derniers mois</div></div><span class="select-control">${exerciseLabel()}</span></div><div class="chart-legend"><span><i class="legend-dot"></i>Entrées</span><span><i class="legend-dot orange"></i>Sorties</span></div>${chartMarkup()}</article><article class="panel side-panel"><div class="panel-heading"><div><h2>Budgets par catégorie</h2><div class="panel-subtitle">Dépenses réalisées sur le budget prévu</div></div><button class="text-action" data-page-link="budgets">Détails ${icons.arrow}</button></div><div class="budget-list">${budgetProgressRows()}</div></article></section>
    ${transactionPanel(recent.slice(0, 5), false)}`;
}

function budgetSpent(budget) {
  return data.transactions.filter((item) => item.type === "expense" && item.category === budget.category && item.status === "Réglé").reduce((sum, item) => sum + Number(item.amount), 0);
}

function budgetProgressRows() {
  return data.budgets.slice(0, 4).map((budget) => {
    const spent = budgetSpent(budget);
    const ratio = budget.limit > 0 ? Math.min(100, (spent / budget.limit) * 100) : 0;
    return `<div><div class="budget-row-head"><span class="budget-name">${escapeHtml(budget.name)}</span><span class="budget-amount"><strong>${euro.format(spent)}</strong> / ${euro.format(budget.limit)}</span></div><div class="progress-track"><span class="${ratio >= 80 ? "warning" : ""}" style="width:${ratio}%"></span></div></div>`;
  }).join("") || `<div class="empty-state">Ajoutez un budget pour suivre vos dépenses.</div>`;
}

function filteredTransactions() {
  return [...data.transactions].filter((item) => (transactionFilter === "all" || item.type === transactionFilter) && `${item.title} ${item.category} ${item.status}`.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
}

function renderTreasury() {
  return `${heading("Trésorerie", "Suivez chaque entrée et sortie de votre association.", actionButton("Exporter CSV", "export-csv", "download", true) + actionButton("Nouvelle opération", "new-transaction"))}
    <section class="metric-grid">${metric("Solde disponible", euro.format(balance()), "Solde de départ et opérations réglées", "€", balance() >= 0)}${metric("Total des entrées", euro.format(sumTransactions("income")), "Opérations réglées", "↗", true)}${metric("Total des sorties", euro.format(sumTransactions("expense")), "Opérations réglées", "↘")}${metric("En attente", String(data.transactions.filter((item) => item.status === "En attente").length), "À vérifier ou à relancer", "◷")}</section>
    ${transactionPanel(filteredTransactions())}`;
}

function memberRows() {
  const members = data.members.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(memberQuery.toLowerCase()));
  return members.map((member, index) => `<tr><td class="member-name-cell"><span class="member-avatar tone-${index % 4}">${escapeHtml(initials(member.name))}</span> ${escapeHtml(member.name)}</td><td>${escapeHtml(member.email || "—")}</td><td>${escapeHtml(member.role)}</td><td>${dateLabel(member.joined)}</td><td><span class="member-status${member.status === "Actif" ? "" : " inactive"}">${escapeHtml(member.status)}</span></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">Aucun membre ne correspond à cette recherche.</div></td></tr>`;
}

function renderMembers() {
  const active = data.members.filter((member) => member.status === "Actif").length;
  return `${heading("Membres", "Gardez le lien avec celles et ceux qui font vivre l'association.", actionButton("Ajouter un membre", "new-member"))}
    <section class="metric-grid">${metric("Membres au total", String(data.members.length), "Dans l'annuaire de l'association", "♧")}${metric("Membres actifs", String(active), "Adhésions à jour", "✓", true)}${metric("Adhésions à renouveler", String(data.members.length - active), "Pensez à les contacter", "◷")}${metric("Cotisation annuelle", euro.format(settings.membershipFee), "Montant défini dans Mon profil", currencyUnit())}</section>
    <section class="panel lower-panel"><div class="panel-heading"><div><h2>Annuaire des membres</h2><div class="panel-subtitle">${data.members.length} personne${data.members.length === 1 ? "" : "s"} dans l'association</div></div><label class="toolbar-search">${icons.search}<span class="sr-only">Rechercher un membre</span><input id="member-search" placeholder="Rechercher" value="${escapeHtml(memberQuery)}" /></label></div><div class="table-wrap"><table class="members-table"><thead><tr><th>MEMBRE</th><th>EMAIL</th><th>RÔLE</th><th>INSCRIT·E LE</th><th>STATUT</th></tr></thead><tbody>${memberRows()}</tbody></table></div></section>`;
}

function renderBudgets() {
  const spentAll = data.budgets.reduce((sum, budget) => sum + budgetSpent(budget), 0);
  const total = data.budgets.reduce((sum, budget) => sum + Number(budget.limit), 0);
  const symbols = ["✳", "⌂", "◉", "◇", "✦", "▦"];
  const cards = data.budgets.map((budget, index) => {
    const spent = budgetSpent(budget);
    const ratio = budget.limit > 0 ? Math.min(100, spent / budget.limit * 100) : 0;
    return `<article class="budget-card"><div class="budget-card-top"><span class="category-icon">${symbols[index % symbols.length]}</span><span class="status-pill${ratio >= 80 ? " pending" : ""}">${ratio >= 80 ? "À surveiller" : "En bonne voie"}</span></div><h3>${escapeHtml(budget.name)}</h3><div class="budget-description">${escapeHtml(budget.description)}</div><div class="big-used">${euro.format(spent)}</div><div class="budget-total">sur ${euro.format(budget.limit)} prévus</div><div class="progress-track"><span class="${ratio >= 80 ? "warning" : ""}" style="width:${ratio}%"></span></div><div class="budget-card-footer"><span>${Math.round(ratio)} % utilisé</span><span>Reste ${euro.format(Math.max(0, budget.limit - spent))}</span></div></article>`;
  }).join("");
  return `${heading("Budgets", "Planifiez vos dépenses et gardez le cap sur vos projets.", actionButton("Nouveau budget", "new-budget"))}
    <section class="metric-grid">${metric("Budget annuel prévu", euro.format(total), `${data.budgets.length} catégories budgétaires`, "▦")}${metric("Dépenses réalisées", euro.format(spentAll), "Sur les budgets configurés", "↘")}${metric("Budget restant", euro.format(Math.max(0, total - spentAll)), "Disponible pour vos projets", "✓", true)}${metric("Catégories", String(data.budgets.length), "Budgets suivis", "⌂")}</section>
    <div class="section-grid">${cards || `<div class="empty-state">Aucun budget. Créez une catégorie pour commencer.</div>`}</div>`;
}

function renderReports() {
  const income = sumTransactions("income");
  const expense = sumTransactions("expense");
  const budgetTotal = data.budgets.reduce((sum, budget) => sum + Number(budget.limit), 0);
  const remaining = Math.max(0, budgetTotal - data.budgets.reduce((sum, budget) => sum + budgetSpent(budget), 0));
  const total = income + expense || 1;
  const activeMembers = data.members.filter((member) => member.status === "Actif").length;
  return `${heading("Rapports", "Une vue claire de la santé financière de votre association.", actionButton("Télécharger les opérations", "export-csv", "download", true))}
    <section class="section-grid"><article class="report-card"><div class="report-kicker">SOLDE DE TRÉSORERIE</div><div class="report-value">${euro.format(balance())}</div><div class="report-detail">Disponible sur votre compte principal</div></article><article class="report-card"><div class="report-kicker">TOTAL DES ENTRÉES</div><div class="report-value">${euro.format(income)}</div><div class="report-detail">${data.transactions.filter((item) => item.type === "income" && item.status === "Réglé").length} opérations réglées</div></article><article class="report-card"><div class="report-kicker">TOTAL DES SORTIES</div><div class="report-value">${euro.format(expense)}</div><div class="report-detail">${data.transactions.filter((item) => item.type === "expense" && item.status === "Réglé").length} opérations réglées</div></article></section>
    <section class="dashboard-grid report-section"><article class="panel"><div class="panel-heading"><div><h2>Répartition des flux</h2><div class="panel-subtitle">Entrées et sorties de trésorerie</div></div></div><div class="report-bar"><span style="width:${income / total * 100}%"></span><span style="width:${expense / total * 100}%"></span><span style="flex:1"></span></div><div class="report-legend"><div class="report-legend-row"><span class="report-legend-label"><i class="legend-square"></i>Entrées</span><strong>${euro.format(income)}</strong></div><div class="report-legend-row"><span class="report-legend-label"><i class="legend-square orange"></i>Sorties</span><strong>${euro.format(expense)}</strong></div><div class="report-legend-row"><span class="report-legend-label"><i class="legend-square gray"></i>Budget restant</span><strong>${euro.format(remaining)}</strong></div></div><p class="report-note">Données calculées depuis les opérations enregistrées sur cet appareil.</p></article>
    <article class="panel"><div class="panel-heading"><div><h2>Résumé des adhésions</h2><div class="panel-subtitle">Annuaire de l'association</div></div></div><div class="budget-list"><div><div class="budget-row-head"><span class="budget-name">Membres actifs</span><span class="budget-amount"><strong>${activeMembers}</strong> / ${data.members.length}</span></div><div class="progress-track"><span style="width:${data.members.length ? activeMembers / data.members.length * 100 : 0}%"></span></div></div><div class="report-legend-row"><span>Opérations en attente</span><strong>${data.transactions.filter((item) => item.status === "En attente").length}</strong></div></div></article></section>
    ${transactionPanel([...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), false)}`;
}

function renderProfile() {
  return `${heading("Mon profil", "Personnalisez votre espace et protégez vos données avec une sauvegarde.")}
    <section class="profile-layout"><article class="panel profile-form-panel"><div class="panel-heading"><div><h2>Informations de l'association</h2><div class="panel-subtitle">Ces informations restent dans votre navigateur.</div></div></div>
      <form id="profile-form" class="profile-form"><div class="field"><label for="profile-full-name">Votre nom</label><input id="profile-full-name" name="full_name" type="text" maxlength="120" autocomplete="name" required value="${escapeHtml(profile.full_name)}" /></div>
      <div class="field"><label for="profile-association-name">Nom de l'association</label><input id="profile-association-name" name="association_name" type="text" maxlength="150" required value="${escapeHtml(associationName())}" /></div>
      <div class="field"><label for="profile-email">E-mail (facultatif)</label><input id="profile-email" name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(profile.email || "")}" /></div>
      <div class="field"><label for="profile-opening-balance">Solde au début du suivi (${escapeHtml(currencyUnit())})</label><input id="profile-opening-balance" name="opening_balance" type="number" step="0.01" value="${Number(profile.opening_balance || 0)}" required /><small>Ce montant sert de point de départ au calcul de la trésorerie.</small></div>
      <div class="profile-form-actions"><button class="button button-primary" type="submit">Enregistrer mon profil</button></div></form></article>
      <article class="panel profile-account-panel"><div class="panel-heading"><div><h2>Vos données</h2><div class="panel-subtitle">Sans compte, synchronisation ni mot de passe.</div></div></div><p id="storage-notice">Vos données sont enregistrées sur cet appareil. Elles ne sont accessibles que depuis ce navigateur.</p><div class="profile-account-actions"><button class="button button-quiet" id="export-backup" type="button">${icons.download} Télécharger une sauvegarde</button><button class="button button-quiet" id="import-backup" type="button">Restaurer une sauvegarde</button></div></article>
      <article class="panel settings-panel"><div class="panel-heading"><div><h2>Réglages personnalisables</h2><div class="panel-subtitle">Adaptez les montants, les catégories et les rôles à votre association.</div></div></div>
        <form id="settings-form" class="settings-form">
          <div class="field"><label for="settings-membership-fee">Montant de la cotisation annuelle (${escapeHtml(currencyUnit())})</label><input id="settings-membership-fee" name="membership_fee" type="number" min="0" step="0.01" value="${settings.membershipFee}" required /></div>
          <div class="field"><label for="settings-currency">Devise</label><select id="settings-currency" name="currency">${currencies.map((currency) => `<option value="${currency}"${currency === settings.currency ? " selected" : ""}>${currency}</option>`).join("")}</select><small>Changer de devise ne convertit pas les montants déjà saisis.</small></div>
          <div class="field"><label for="settings-fiscal-month">Début de l'exercice comptable</label><select id="settings-fiscal-month" name="fiscal_year_start_month">${months.map((month, index) => `<option value="${index + 1}"${index + 1 === settings.fiscalYearStartMonth ? " selected" : ""}>${month}</option>`).join("")}</select></div>
          <div class="field"><label for="settings-categories">Catégories des opérations</label><textarea id="settings-categories" name="transaction_categories" rows="5" required>${escapeHtml(settings.transactionCategories.join("\n"))}</textarea><small>Une catégorie par ligne. Utilisées dans les opérations de trésorerie.</small></div>
          <div class="field"><label for="settings-roles">Rôles des membres</label><textarea id="settings-roles" name="member_roles" rows="5" required>${escapeHtml(settings.memberRoles.join("\n"))}</textarea><small>Un rôle par ligne. Utilisés dans l'annuaire des membres.</small></div>
          <div class="profile-form-actions"><button class="button button-primary" type="submit">Enregistrer les réglages</button></div>
        </form>
      </article></section>`;
}

function bindPageActions() {
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action)));
  document.querySelectorAll("[data-page-link]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.pageLink)));
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { transactionFilter = button.dataset.filter; render(); }));
  const transactionSearch = document.querySelector("#transaction-search");
  if (transactionSearch) transactionSearch.addEventListener("input", (event) => {
    searchQuery = event.target.value;
    const position = event.target.selectionStart;
    render();
    const input = document.querySelector("#transaction-search");
    input.focus();
    input.setSelectionRange(position, position);
  });
  const memberSearch = document.querySelector("#member-search");
  if (memberSearch) memberSearch.addEventListener("input", (event) => {
    memberQuery = event.target.value;
    const position = event.target.selectionStart;
    render();
    const input = document.querySelector("#member-search");
    input.focus();
    input.setSelectionRange(position, position);
  });
  document.querySelector("#profile-form")?.addEventListener("submit", handleProfileSubmit);
  document.querySelector("#settings-form")?.addEventListener("submit", handleSettingsSubmit);
  document.querySelector("#export-backup")?.addEventListener("click", exportBackup);
  document.querySelector("#import-backup")?.addEventListener("click", () => document.querySelector("#backup-file").click());
}

function navigate(page) {
  if (!pageTitles[page]) return;
  currentPage = page;
  document.querySelector("#sidebar").classList.remove("open");
  render();
}

function handleAction(action) {
  if (action === "new-transaction") openModal("transaction");
  else if (action === "new-member") openModal("member");
  else if (action === "new-budget") openModal("budget");
  else if (action === "export-csv") exportTransactions();
}

function openModal(mode) {
  modalMode = mode;
  const configuration = {
    transaction: { title: "Nouvelle opération", submit: "Enregistrer l’opération", fields: [
      field("description", "Description", "text", "Ex. Cotisation annuelle", true),
      field("amount", `Montant (${currencyUnit()})`, "number", "0,00", true, 'min="0.01" step="0.01"'),
      selectField("type", "Type", [["income", "Entrée"], ["expense", "Sortie"]]),
      selectField("category", "Catégorie", settings.transactionCategories.map((category) => [category, category])),
      field("date", "Date", "date", "", true, "", relativeDate(0)),
      selectField("status", "Statut", [["Réglé", "Réglé"], ["En attente", "En attente"]])
    ] },
    member: { title: "Ajouter un membre", submit: "Ajouter au registre", fields: [
      field("name", "Nom complet", "text", "Ex. Alex Dupont", true),
      field("email", "Adresse e-mail (facultative)", "email", "alex@email.fr"),
      selectField("role", "Rôle", settings.memberRoles.map((role) => [role, role])),
      field("joined", "Date d'adhésion", "date", "", true, "", relativeDate(0))
    ] },
    budget: { title: "Nouveau budget", submit: "Créer le budget", fields: [
      field("name", "Nom de la catégorie", "text", "Ex. Formation", true),
      field("limit", `Montant prévu (${currencyUnit()})`, "number", "0,00", true, 'min="0.01" step="0.01"'),
      field("description", "Description", "text", "À quoi servira ce budget ?", true),
      field("category", "Catégorie des opérations", "text", "Ex. Formation", true)
    ] }
  }[mode];
  document.querySelector("#modal-title").textContent = configuration.title;
  document.querySelector("#modal-submit").textContent = configuration.submit;
  document.querySelector("#modal-fields").innerHTML = configuration.fields.join("");
  document.querySelector("#modal-backdrop").hidden = false;
  document.querySelector("#modal-fields input, #modal-fields select")?.focus();
}

function field(name, label, type, placeholder, required = false, extra = "", value = "") {
  return `<div class="field${name === "description" && modalMode !== "budget" ? " full" : ""}"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} ${extra} ${value ? `value="${escapeHtml(value)}"` : ""} /></div>`;
}

function selectField(name, label, options) {
  return `<div class="field"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`).join("")}</select></div>`;
}

function closeModal() {
  document.querySelector("#modal-backdrop").hidden = true;
  document.querySelector("#modal-form").reset();
}

function handleSubmit(event) {
  event.preventDefault();
  const previousData = {
    transactions: [...data.transactions],
    members: [...data.members],
    budgets: [...data.budgets]
  };
  const form = new FormData(event.currentTarget);
  const value = (key) => String(form.get(key) || "").trim();
  if (modalMode === "transaction") {
    const amount = Number(value("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return toast("Saisissez un montant supérieur à zéro.", true);
    data.transactions.push({ id: createId(), title: value("description"), category: value("category"), date: value("date"), amount, type: value("type"), status: value("status") });
    currentPage = "treasury";
  } else if (modalMode === "member") {
    if (value("email") && data.members.some((member) => member.email.toLowerCase() === value("email").toLowerCase())) return toast("Cette adresse e-mail figure déjà dans l’annuaire.", true);
    data.members.push({ id: createId(), name: value("name"), email: value("email"), role: value("role"), joined: value("joined"), status: "Actif" });
    currentPage = "members";
  } else {
    const limit = Number(value("limit"));
    if (!Number.isFinite(limit) || limit <= 0) return toast("Saisissez un budget supérieur à zéro.", true);
    data.budgets.push({ id: createId(), name: value("name"), description: value("description"), limit, category: value("category") });
    currentPage = "budgets";
  }
  if (!saveWorkspace()) {
    data = previousData;
    return;
  }
  closeModal();
  render();
  toast(modalMode === "transaction" ? "Opération enregistrée." : modalMode === "member" ? "Membre ajouté à l’annuaire." : "Budget créé.");
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const openingBalance = Number(form.get("opening_balance"));
  const fullName = String(form.get("full_name") || "").trim();
  const name = String(form.get("association_name") || "").trim();
  const email = String(form.get("email") || "").trim();
  if (!fullName || !name || !Number.isFinite(openingBalance)) return toast("Renseignez un nom, une association et un solde valide.", true);
  const previous = profile;
  profile = { full_name: fullName, association_name: name, email, opening_balance: openingBalance };
  if (!saveWorkspace()) {
    profile = previous;
    return;
  }
  render();
  toast("Profil mis à jour.");
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const membershipFeeValue = String(form.get("membership_fee") || "").trim();
  const membershipFee = Number(membershipFeeValue);
  const currency = String(form.get("currency") || "");
  const fiscalYearStartMonth = Number(form.get("fiscal_year_start_month"));
  const parseList = (key) => [...new Set(String(form.get(key) || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
  const transactionCategories = parseList("transaction_categories");
  const memberRoles = parseList("member_roles");
  if (!membershipFeeValue || !Number.isFinite(membershipFee) || membershipFee < 0) return toast("Saisissez un montant de cotisation valide.", true);
  if (!currencies.includes(currency)) return toast("Choisissez une devise disponible.", true);
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) return toast("Choisissez un mois de début d'exercice valide.", true);
  if (!transactionCategories.length || !memberRoles.length) return toast("Ajoutez au moins une catégorie et un rôle.", true);
  if ([...transactionCategories, ...memberRoles].some((item) => item.length > 60)) return toast("Chaque catégorie et chaque rôle doit faire 60 caractères maximum.", true);
  const previous = settings;
  setSettings({ membershipFee, currency, fiscalYearStartMonth, transactionCategories, memberRoles });
  if (!saveWorkspace()) {
    setSettings(previous);
    return;
  }
  render();
  toast("Réglages enregistrés.");
}

function csvCell(value) {
  let text = String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportTransactions() {
  const columns = ["Date", "Description", "Type", "Catégorie", `Montant (${settings.currency})`, "Statut"];
  const lines = data.transactions.map((item) => [item.date, item.title, item.type === "income" ? "Entrée" : "Sortie", item.category, Number(item.amount).toFixed(2), item.status]);
  const csv = [columns, ...lines].map((row) => row.map(csvCell).join(";")).join("\r\n");
  downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${fileSlug()}-tresorerie-${relativeDate(0)}.csv`);
  toast("Export CSV téléchargé.");
}

function fileSlug() {
  return associationName().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "association";
}

function exportBackup() {
  const backup = JSON.stringify({ version: 1, profile, settings, ...data }, null, 2);
  downloadBlob(new Blob([backup], { type: "application/json" }), `${fileSlug()}-sauvegarde-${relativeDate(0)}.json`);
  toast("Sauvegarde téléchargée.");
}

async function importBackup(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.version !== 1 || !isValidWorkspace(backup)) {
      throw new Error("Le fichier ne correspond pas à une sauvegarde Ensemble.");
    }
    if (!window.confirm("Remplacer les données actuelles par celles de cette sauvegarde ? Cette action ne peut pas être annulée.")) return;
    const previousProfile = profile;
    const previousData = data;
    const previousSettings = settings;
    profile = {
      full_name: String(backup.profile.full_name),
      email: String(backup.profile.email || ""),
      association_name: String(backup.profile.association_name || "Mon association"),
      opening_balance: Number(backup.profile.opening_balance)
    };
    data = { transactions: backup.transactions, members: backup.members, budgets: backup.budgets };
    setSettings(backup.settings);
    if (!saveWorkspace()) {
      profile = previousProfile;
      data = previousData;
      setSettings(previousSettings);
      return;
    }
    currentPage = "dashboard";
    showApp();
    toast("Sauvegarde restaurée.");
  } catch (error) {
    console.error("Impossible de restaurer cette sauvegarde.", error);
    toast(error instanceof SyntaxError ? "Le fichier n’est pas un JSON valide." : error.message || "Impossible de restaurer cette sauvegarde.", true);
  } finally {
    input.value = "";
  }
}

function fieldEventListeners() {
  document.querySelector("#setup-form").addEventListener("submit", finishSetup);
  document.querySelector("#setup-restore").addEventListener("click", () => document.querySelector("#backup-file").click());
  document.querySelector("#backup-file").addEventListener("change", importBackup);
  document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
  document.querySelector("#profile-shortcut").addEventListener("click", () => navigate("profile"));
  document.querySelector("#top-avatar").addEventListener("click", () => navigate("profile"));
  document.querySelector("#modal-form").addEventListener("submit", handleSubmit);
  document.querySelectorAll(".close-modal").forEach((button) => button.addEventListener("click", closeModal));
  document.querySelector("#modal-backdrop").addEventListener("click", (event) => { if (event.target.id === "modal-backdrop") closeModal(); });
  document.querySelector("#menu-button").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
  document.querySelector("#notification-button").addEventListener("click", () => toast("Vous êtes à jour, aucune nouvelle notification."));
  document.querySelector("#help-button").addEventListener("click", () => toast("Conseil : téléchargez régulièrement une sauvegarde depuis Mon profil."));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#modal-backdrop").hidden) closeModal();
  });
}

fieldEventListeners();
loadWorkspace();
