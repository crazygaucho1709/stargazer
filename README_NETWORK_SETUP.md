# Configuration Réseau (Jardin / Wi-Fi Domestique)

Puisque vous avez choisi la **Solution 2 (Wi-Fi de la maison)**, voici les étapes exactes pour que votre ordinateur, Stargazer et l'Astroberry communiquent parfaitement.

## Étape 1 : Basculer l'Astroberry sur le réseau domestique
Par défaut, l'Astroberry crée son propre réseau (Hotspot). Il faut lui dire de rejoindre le vôtre.

1. Connectez-vous temporairement au réseau Wi-Fi `astroberry` depuis votre ordinateur.
2. Allez sur `http://astroberry.local` (ou `http://10.42.0.1`) et accédez au bureau à distance (VNC).
3. Cliquez sur l'icône Wi-Fi (en haut à droite de la barre des tâches du Raspberry Pi).
4. Désactivez le mode "Hotspot" et connectez-vous au Wi-Fi de votre maison (votre Box).
5. L'Astroberry va se déconnecter de votre ordinateur. C'est normal !

## Étape 2 : Reconnecter votre ordinateur
1. Reconnectez votre ordinateur (Mac/PC) au Wi-Fi de votre maison.
2. Maintenant, votre PC et le télescope sont sur le même réseau, et tous les deux ont accès à Internet !

## Étape 3 : Trouver la nouvelle adresse IP
Puisque l'Astroberry est sur le routeur de la maison, il a reçu une nouvelle adresse IP (généralement de type `192.168.x.x` ou `10.0.x.x`).
* Soit vous pouvez toujours le joindre via `http://astroberry.local` (grâce au protocole mDNS/Bonjour, souvent géré nativement sur Mac).
* Soit vous devez trouver son adresse IP en vous connectant à l'interface d'administration de votre Box Internet (regardez les "appareils connectés" et cherchez le nom "astroberry" ou "raspberrypi").

## Étape 4 : Configurer Stargazer
1. Lancez Stargazer.
2. Ouvrez le **Menu de Configuration** (engrenage).
3. Allez dans l'onglet **Connexion & Matériel**.
4. Dans le champ `URL SERVEUR`, mettez soit `http://astroberry.local` soit la vraie IP (ex: `http://192.168.1.50`).
5. Cliquez sur **Tester la connexion**.

Une fois que c'est vert, l'IA, la météo et le télescope fonctionneront en totale synergie !
