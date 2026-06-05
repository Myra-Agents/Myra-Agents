# Myra Agents — Ideas (brut)

> Dump brut, pas trié par priorité. App = Kanban board qui lance des agents CLI
> headless (opencode/claude/copilot/custom). Cartes Draft→Todo→In Progress→
> Waiting Feedback→Awaiting Review→Done. Schedules cron, planner, logs,
> connections (sidecar local + hub cloud), auth/entitlements, templates, i18n.
>
> Format : `- idée` puis `→ cas d'usage concret`.

## Agent execution / orchestration
- Multi-agent par carte : N agents en parallèle, comparer outputs (best-of-N).
  → "Refacto ce module" lancé sur claude + opencode + copilot, dev garde la meilleure diff.
- Auto done (met une carte à done automatiquement, pas besoin de review)
- Agent handoff : preset change selon la lane (claude code → opencode review).
  → Carte codée par claude en In Progress, passe auto en review par un 2e agent en Awaiting Review.
- Retry auto sur échec (backoff, max attempts configurable).
  → Agent crash sur rate-limit API ; relance seule 3× au lieu de bloquer la nuit.
- Cancel/pause/resume d'un run sans tuer le process brutalement.
  → Dev voit l'agent partir dans le mauvais sens, pause, corrige le prompt, resume.
- Streaming token-level (pas juste lignes) + rendu markdown live.
  → Suivre le raisonnement de l'agent mot à mot, repérer la dérive tôt.
- Détection "agent bloqué / attend input" → bump carte en Waiting Feedback.
  → Agent demande "quel fichier ?" ; la carte remonte au lieu de rester pendue.
- Budget/cost cap par carte (tokens, $, wall-clock) → kill si dépassé.
  → Tâche d'explo plafonnée à 2$ ; pas de surprise de 40$ sur une boucle infinie.
- Dry-run : preview du prompt+args assemblés avant lancement.
  → Vérifier que le template a bien injecté la branche/repo avant de cramer un run.
- Templating prompt avancé : variables, includes, snippets réutilisables.
  → Bloc "règles de style maison" inclus dans 30 cartes sans copier-coller.
- Chaînage de cartes (DAG) : carte B démarre quand A done, passe l'output.
  → "Écris specs" → "implémente" → "écris tests" en pipeline auto.
- Pouvoir choisir le model utilisé (surement dans les preset ou overidé dans la carte)

## Kanban / UX board
- Sous-tâches / checklist dans une carte.
  → Carte "migration auth" avec 6 sous-étapes cochées au fur et à mesure.
- Labels/tags + filtres + recherche full-text cartes & logs.
  → Filtrer toutes les cartes `bug` `frontend` non terminées en 1 clic.
- Swimlanes (par projet, agent, repo).
  → Board partagé entre 3 repos, une ligne par repo, vue d'ensemble.
- WIP limits par colonne (alerte si trop de In Progress).
  → Empêche de lancer 12 agents en même temps et saturer la machine.
- Bulk actions (multi-select : move, relaunch, delete).
  → Sélectionner 8 cartes échouées et tout relancer après un fix d'env.
- Vue liste/table + vue timeline/Gantt des runs.
  → Manager veut un tableau triable par durée/coût, pas un board.
- Card templates partagés / marketplace.
  → Template "ajoute endpoint REST + test" réutilisé par toute l'équipe.
- Undo global (cmd+Z) sur move/delete/edit.
  → Carte glissée par erreur dans Trash, cmd+Z la récupère.
- Quick-add via palette commande (cmd+K).
  → Idée en pleine review : cmd+K, tape le prompt, carte créée sans lâcher le clavier.
- Drag fichier/repo sur board → carte pré-remplie.
  → Glisser un dossier projet ; carte créée avec repo+branche déjà remplis.
- Avoir la possibilité de voir le détail d'une carte pour voir plus de choses
- Pour des taches dont l'agent créer des sous-taches (todo dans le prompt par ex) quand on clique sur la carte on peut voir les sous-taches sous-formes de diagramme de flux avec des ronds comme sur le git tree, il faudrait aussi voir les taches de fond ou subagents d'une autre manière.
- En utilisant le playground skill (installé par défaut par l'app par ex) générer des interfaces artifacts qu'on puisse voir dans l'application

## Schedules / automation
- Schedules conditionnels (git changé, CI rouge, issue ouverte, websocket).
  → Lance l'agent "fix CI" seulement quand le build casse, pas toutes les heures.
- Webhooks entrants : GitHub issue/PR → matérialise carte.
  → Nouvelle issue `good-first-fix` → carte auto en Todo, prête à lancer.
- Trigger sur événement filesystem (watcher déjà là, exposer en trigger).
  → Sauvegarde d'un `.proto` → regénère les clients auto.
- Export iCal des runs planifiés.
  → Voir dans son agenda quand le batch nocturne de cartes tournera.
- Pause globale des schedules (mode "ne rien lancer"). (bouton rouge comme sur un robot en usine)
  → Avant une démo / pendant un incident, tout geler en un toggle.
- Créer un shortcut configuré sur l'app sur mac/win/linux pour que quand on fait un click droit sur un fichier spécifique ou un dossier on puisse lancer une action spéciale comme trier le dossier, etc

## Intégrations
- GitHub : ouvrir PR depuis carte Done, lier issue, statut checks dans carte.
  → Agent fini → bouton "Open PR" → checks CI affichés sur la carte.
- Intégrer des agents provider par API (utilise le llm plutôt)
- GitLab / Bitbucket parité.
  → Boîte sur GitLab self-hosted peut utiliser Myra pareil.
- Linear / Jira / Monday : sync bidirectionnel cartes ↔ tickets.
  → Ticket Linear assigné → carte Myra ; carte Done → ticket fermé.
- Slack / Discord : notif fin de run, feedback inline.
  → Ping Slack "carte X attend feedback", répondre depuis Slack.
- MCP : Myra comme client MCP, brancher tools externes.
  → Agent accède à la doc interne via un MCP server maison.
- Editor : ouvrir diff/résultat dans VS Code / Cursor.
  → Cliquer "open in editor" pour reviewer la diff dans son IDE habituel.
- Créer une api pour intéragir à distance

## Review / feedback loop
- Diff viewer intégré (avant/après) + accept/reject par hunk.
  → Garder 3 hunks sur 5 de la proposition de l'agent, rejeter le reste.
- Inline comments sur diff → renvoyés à l'agent comme feedback.
  → Commenter "renomme cette var" sur la ligne, l'agent re-run avec ce retour.
- Approve & merge en un clic depuis Awaiting Review.
  → Review OK → merge + carte Done sans quitter l'app.
- Historique des révisions d'une carte (versions output).
  → Comparer la v1 et la v3 de la solution après 2 feedbacks.
- Side-by-side de plusieurs runs (comparer 2 agents).
  → Voir claude vs opencode côte à côte sur la même tâche.

## Observability / logs
- Recherche & filtre logs (carte, niveau, regex).
  → Retrouver toutes les lignes `ERROR` d'un run de 2000 lignes.
- Métriques : runs/jour, taux succès, durée moyenne, coût par agent.
  → Constater que copilot échoue 2× plus que claude sur ce repo.
- Dashboard analytics (throughput, cycle time par lane).
  → Voir que les cartes stagnent 3 jours en Awaiting Review → goulot.
- Export logs (json/md) + partage lien.
  → Joindre le log d'un run buggé à un rapport de bug.
- Replay d'un run depuis logs.
  → Rejouer un run pour comprendre une régression sans relancer l'agent.
- Alertes (échec N fois, coût anormal).
  → Notif si une carte a brûlé 10$ ou échoué 5 fois.
- Avoir des stats sur l'utilisation RAM, CPU des agents

## Organisation

## Entreprise / consolidation org-wide (hub)
- Connecter tous les agents d'une boîte → un seul plan central au-dessus des agents.
  → CTO voit en un board les 200 agents qui tournent dans l'entreprise, tous départements confondus.
- Vue d'ensemble temps réel de tous les agents actifs (registry + heartbeat).
  → Repérer d'un coup d'œil quels agents tournent, où, pour qui, maintenant.
- Analytics usage global ou par secteur/département/équipe.
  → Comparer l'usage agents de la team Data vs la team Front sur le mois.
- Knowledge base construite au fil de l'eau depuis les runs des agents.
  → Chaque run alimente une KB partagée ; le 50e agent profite de ce qu'ont appris les 49 autres.
- Alignement OKR : voir si les agents s'éloignent ou se rapprochent des OKR boîte/département.
  → Heatmap "drift OKR" : dept Sales a 8 agents qui bossent hors-objectif ce trimestre.
- Consolidation des apprentissages entre agents (promouvoir un learning local → KB partagée).
  → Un agent découvre la convention de nommage interne ; promue une fois, tous les agents l'appliquent.
- Score de "distance aux OKR" par run/agent (LLM-judge ou embeddings activité vs texte OKR).
  → Mesurable au lieu de flou : chaque agent a un % d'alignement OKR dans le temps.
- Découpage multi-tenant : entreprise → départements → agents → users.
  → Admin boîte gère les accès par dept ; chaque dept voit ses propres agents et métriques.
- Frontière de données / privacy : choisir ce qui remonte au hub (metadata vs contenu) par agent/dept, opt-in + audit.
  → Dept légal en metadata-only ; dept marketing remonte le contenu complet pour la KB.
- Curation de la KB partagée (humain ou agent reviewer) avant promotion d'un learning.
  → Évite la pollution : un learning douteux passe en review avant d'entrer dans la KB globale.

## Collaboration / cloud (hub)
- Boards partagés multi-users (connections/remote existe → pousser).
  → Équipe de 4 voit le même board, qui bosse sur quoi.
- Présence temps réel (qui regarde quelle carte).
  → Éviter que deux devs lancent un agent sur la même carte.
- Commentaires / mentions sur cartes.
  → "@alice tu valides cette approche ?" directement sur la carte.
- Rôles & permissions (viewer/editor/admin).
  → Stagiaire en viewer ne peut pas lancer d'agent en prod.
- Audit log des actions.
  → Savoir qui a relancé l'agent qui a force-push.
- Remote run : agent sur runner cloud, pas la machine locale.
  → Lancer un gros run et fermer son laptop, ça continue côté serveur.

## Settings / config
- Profils d'agent versionnés + import/export.
  → Partager sa config "claude + args optimisés" avec un collègue.
- Secrets manager (clés API par agent, chiffrées au repos).
  → Clé OpenAI stockée chiffrée, pas en clair dans un fichier de conf.
- Env vars par carte / par projet.
  → Carte staging avec `API_URL=staging`, carte prod différente.
- Per-repo defaults (preset, branche, args).
  → Repo Rust → preset+branche `develop` pré-remplis à chaque carte.
- Onboarding wizard premier lancement.
  → Nouveau user guidé : choisis ton agent, ta clé, ton repo → premier run.
- Validation live d'un preset (test "hello world" run).
  → Bouton "test" vérifie que le binaire agent répond avant usage réel.

## Plugins (repo plugins/)
- Plugin API publique + docs + scaffolding CLI.
  → Dev tiers crée un plugin "deploy Vercel" en suivant la doc.
- Hooks lifecycle (pre-run, post-run, on-feedback).
  → Hook post-run qui poste un résumé dans Notion automatiquement.
- Plugin marketplace / registry in-app.
  → Installer "GitHub PR opener" depuis un catalogue sans copier du code.
- Sandbox d'exécution des plugins.
  → Plugin communautaire isolé, ne peut pas lire toutes tes clés.

## Qualité de vie / desktop
- Command palette globale (cmd+K) — actions, nav, recherche.
  → Tout piloter au clavier : créer carte, aller aux logs, lancer run.
- Raccourcis clavier complets + cheat sheet (use-global-shortcuts existe).
  → Power user enchaîne les cartes sans souris ; `?` affiche la liste.
- Notifs natives OS + badge dock sur fin de run.
  → Run de 20 min fini → notif macOS même app en arrière-plan.
- Mode focus / plein écran sur une carte.
  → Se concentrer sur une grosse carte sans le bruit du board.
- Multi-fenêtre (un board par fenêtre).
  → Board "perso" et board "équipe" sur deux écrans.
- Thèmes custom + densité compacte.
  → Afficher 40 cartes d'un coup sur un grand écran en mode dense.
- Mode hors-ligne robuste + sync au retour.
  → Bosser dans le train sur le board local, sync quand le wifi revient.
- i18n : ajouter langues (es, de) au-delà en/fr.
  → Équipe à Berlin utilise l'app en allemand.
- A11y : navigation clavier board, ARIA, contraste.
  → User lecteur d'écran peut déplacer une carte entre colonnes.

## Sécurité / fiabilité
- Confirmation avant agent destructif (rm, push force, drop).
  → Agent s'apprête à `git push --force` → popup de confirmation.
- Sandbox/permissions par agent (read-only vs write).
  → Agent "review" en read-only ne peut pas modifier le repo.
- Limite ressources process (CPU/mem) côté sidecar Rust.
  → Un agent qui fork-bomb ne fige pas tout le laptop.
- Chiffrement données board au repos.
  → Prompts/secrets de cartes chiffrés sur disque, pas en clair.
- Crash recovery : reprendre runs interrompus au redémarrage.
  → App crash en plein run → relance, propose de reprendre la carte.

## Monétisation / entitlements (use-entitlement existe)
- Tiers free/pro/org : quotas runs, boards cloud, agents parallèles.
  → Free = 1 board local ; Pro = boards cloud + 5 agents parallèles.; Org = ajoute org features
- Usage metering visible (combien reste ce mois).
  → Barre "120/500 runs utilisés ce mois".
- Team billing via hub.
  → Facturation unique pour une équipe de 10 sièges.

## Idées R&D / plus folles
- Agent "planner" qui découpe une grosse carte en sous-cartes auto.
  → "Construis un blog" → planner crée 8 cartes (auth, posts, CSS…).
- Auto-routing : Myra choisit le meilleur agent selon le type de tâche.
  → Tâche Rust → server agent, tâche UI → claude, choisi tout seul.
- Mémoire par projet : apprend des feedbacks passés.
  → Après 5 "utilise tabs pas spaces", l'agent l'applique sans le redire.
- Voice : dicter un prompt de carte.
  → En réunion, dicter "ajoute un endpoint health" → carte créée.
- Mobile companion (read-only + approve feedback) via hub.
  → Approuver une carte en attente depuis son tel pendant un café.
- App mobile en Tauri (iOS/Android, Tauri v2 supporte le mobile) pour voir le board sur smartphone — réutilise le frontend Next.js, se connecte au hub cloud.
  → Consulter l'état du board et les runs en cours depuis son tel, sans ouvrir le laptop.
