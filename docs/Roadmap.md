# Roadmap du projet

Liste des 17 phases de développement progressif. **Une seule phase à la fois.** Cocher au fur et à mesure.

## Légende
- [ ] Non commencée
- [~] En cours
- [x] Complétée et validée

---

## Fondations (phases 0 à 5)

À l'issue de cette section, un MVP fonctionnel existe sur une seule machine.

- [x] **Phase 0** — [Préparation de l'environnement](phases/phase-00.md)
- [x] **Phase 1** — [Réseau Hyperledger Fabric local minimal](phases/phase-01.md)
- [x] **Phase 2** — [Chaincode minimal](phases/phase-02.md)
- [x] **Phase 3** — [IPFS local](phases/phase-03.md)
- [x] **Phase 4** — [Backend API minimal](phases/phase-04.md)
- [x] **Phase 5** — [Frontend React minimal](phases/phase-05.md)

## Métier et sécurité (phases 6 à 10)

Ajout de l'authentification, de la configuration initiale et des fonctionnalités métier.

- [x] **Phase 6** — [Authentification et rôles RBAC](phases/phase-06.md)
- [x] **Phase 7** — [Assistant de configuration initiale](phases/phase-07.md)
- [ ] **Phase 8** — [Sauvegarde distante via SSH](phases/phase-08.md)
- [ ] **Phase 9** — [Sauvegardes planifiées](phases/phase-09.md)
- [ ] **Phase 10** — [Audit trail et notifications](phases/phase-10.md)

## Robustesse infrastructure (phases 11 à 14)

Passage à un système distribué et tolérant aux pannes.

- [ ] **Phase 11** — [Vue topologique et monitoring](phases/phase-11.md)
- [ ] **Phase 12** — [Cluster Raft pour les orderers](phases/phase-12.md)
- [ ] **Phase 13** — [Déploiement multi-machines](phases/phase-13.md)
- [ ] **Phase 14** — [Ajout dynamique de nœuds par SSH](phases/phase-14.md)

## Production (phases 15 à 17)

Finitions, restauration distante, cluster IPFS et durcissement.

- [ ] **Phase 15** — [Restauration vers serveur distant](phases/phase-15.md)
- [ ] **Phase 16** — [Cluster IPFS et réplication](phases/phase-16.md)
- [ ] **Phase 17** — [Finitions et durcissement production](phases/phase-17.md)

---

## Règles d'avancement

1. **Une phase doit être complète et testée** avant de passer à la suivante.
2. **Cocher la case** [x] uniquement après avoir validé tous les critères de la phase.
3. **Mettre à jour CLAUDE.md** ("État actuel") à chaque transition de phase.
4. **Ne pas anticiper** sur les phases suivantes même si la tentation est grande.