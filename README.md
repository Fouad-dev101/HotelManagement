# Hotelyx — Gestion hôtelière locale
Application de gestion hôtelière pour Windows 11, en français, avec base SQLite locale.

## Prérequis
- Node.js 22.5 ou supérieur (https://nodejs.org)

## Démarrage
Double-cliquez sur `start.bat`. Ou dans un terminal : `npm install` puis `npm run dev`. Ouvrez ensuite http://localhost:5173.
Au premier lancement, un écran de configuration crée votre compte administrateur. Aucun compte par défaut n'est fourni.

## Base de données
Fichier : `data/hotelyx.db` (SQLite). Toutes les données persistent après redémarrage.

## Sauvegarde / restauration
- `npm run db:backup` → crée `data/backups/hotelyx-<date>.db`
- `npm run db:restore` → restaure la sauvegarde la plus récente

## Données de démonstration
`npm run db:seed` → 6 chambres, 2 types, 3 services (uniquement si la base est vide).