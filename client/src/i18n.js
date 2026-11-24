// Interface language, chosen at build time: VITE_LANG=fr builds the French
// site (vote.jeinsat.com); anything else keeps English (voting.jeinsat.com).
//
// t("English text", { name: value }) returns the French text when LANG is
// "fr", else the English text; {name} placeholders are filled in both.
// The English text is the key, so an untranslated string simply stays in
// English. Server messages go through t() too, so the known ones are shown
// in French.

export const LANG = import.meta.env.VITE_LANG === "fr" ? "fr" : "en";

const FR = {
  // Brand / layout
  "Voting system": "Système de vote",
  "404 Oops..! Nothing here": "404 Oups… Il n'y a rien ici",

  // Register (/register)
  "Joining the vote...": "Connexion au vote…",
  "The vote is not open yet. Keep this page open: you will join automatically as soon as the organizers open it.":
    "Le vote n'est pas encore ouvert. Gardez cette page ouverte : vous serez connecté automatiquement dès que les organisateurs l'ouvriront.",
  "To vote, scan the QR code shown on the screen with your phone camera.":
    "Pour voter, scannez le QR code affiché à l'écran avec l'appareil photo de votre téléphone.",
  "Unable to connect to the server. Retrying...": "Impossible de joindre le serveur. Nouvelle tentative…",

  // Join (/join)
  "Checking the QR code...": "Vérification du QR code…",
  "Your email": "Votre adresse e-mail",
  "name@example.com": "nom@exemple.com",
  "Joining...": "Connexion…",
  "Start voting": "Commencer à voter",
  "One email per person. Use the same email if you switch phones.":
    "Une adresse e-mail par personne. Utilisez la même si vous changez de téléphone.",
  "Scan the QR code shown on the screen again with your phone camera.":
    "Scannez à nouveau le QR code affiché à l'écran avec l'appareil photo de votre téléphone.",
  "Unable to connect to the server. Check your connection and try again.":
    "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",

  // Vote page (/home)
  "Your vote for": "Votre vote pour",
  "Yes": "Oui",
  "No": "Non",
  "Submit Vote": "Envoyer mon vote",
  "Submitting...": "Envoi…",
  "Checking your location...": "Vérification de votre position…",
  "Please select Yes or No before submitting.": "Choisissez Oui ou Non avant d'envoyer.",
  "Waiting": "En attente",
  "Voting is now closed - get ready for the next team!": "Le vote est fermé — préparez-vous pour l'équipe suivante !",
  "On stage": "Sur scène",
  "is presenting": "présente",
  "Voting will open shortly.": "Le vote va bientôt ouvrir.",
  "Thank you for your vote": "Merci pour votre vote",
  "Unable to load voting status. Please try again.": "Impossible de charger l'état du vote. Réessayez.",
  "Vote not recorded.": "Vote non enregistré.",
  "Failed to submit vote. Please try again.": "Échec de l'envoi du vote. Réessayez.",
  "Location check": "Vérification de la position",
  "Allow location": "Autoriser la position",
  "Try again": "Réessayer",
  "Finding a precise position. This can take up to 20 seconds indoors.":
    "Recherche d'une position précise. Cela peut prendre jusqu'à 20 secondes à l'intérieur.",

  // Server messages a voter can see
  "Login is closed. Wait for the organizers to open it.":
    "La connexion est fermée. Attendez que les organisateurs l'ouvrent.",
  "This QR code has expired. Scan the code on the screen again.":
    "Ce QR code a expiré. Scannez à nouveau le code affiché à l'écran.",
  "This link is not valid. Scan the QR code on the screen.":
    "Ce lien n'est pas valide. Scannez le QR code affiché à l'écran.",
  "Scan the QR code shown on the screen to vote.": "Scannez le QR code affiché à l'écran pour voter.",
  "Enter a valid email address.": "Saisissez une adresse e-mail valide.",
  "Too many attempts. Please try again later.": "Trop de tentatives. Réessayez plus tard.",
  "Server error. Please try again.": "Erreur du serveur. Réessayez.",
  "Server error": "Erreur du serveur",
  "Not authenticated": "Non connecté",
  "No team is currently presenting": "Aucune équipe ne présente en ce moment",
  "This team is not currently presenting": "Cette équipe ne présente pas en ce moment",
  "You have already voted for this team": "Vous avez déjà voté pour cette équipe",
  "Vote must be 'yes' or 'no'": "Le vote doit être « oui » ou « non »",
  "Invalid team ID": "Équipe invalide",
  "Voter not found": "Votant introuvable",
  "Could not join": "Impossible de rejoindre le vote",
  "Could not check the QR code": "Impossible de vérifier le QR code",

  // Projector (admin "Show QR code")
  "Scan to vote": "Scannez pour voter",
  "New code in {s}s": "Nouveau code dans {s} s",
  "Login is closed. Open login in the dashboard to show the QR code.":
    "La connexion est fermée. Ouvrez la connexion dans le tableau de bord pour afficher le QR code.",
  "Loading...": "Chargement…",
  "Retrying...": "Nouvelle tentative…",

  // Admin: voters panel and emails page
  "See all emails": "Voir tous les e-mails",
  "Voter emails": "E-mails des votants",
  "Back to dashboard": "Retour au tableau de bord",
  "Emails typed": "E-mails saisis",
  "Voted for every team (counted)": "Ont voté pour toutes les équipes (comptés)",
  "Missing at least one team (not counted)": "Il manque au moins une équipe (non comptés)",
  "Search an email": "Rechercher un e-mail",
  "Download CSV": "Télécharger CSV",
  "Email": "E-mail",
  "Teams voted": "Équipes votées",
  "Joined at": "Inscrit à",
  "Counted": "Compté",
  "Not counted": "Non compté",
  "No email yet.": "Aucun e-mail pour l'instant.",
  "No email matches.": "Aucun e-mail ne correspond.",
  "(no email)": "(sans e-mail)",
  "Updated every 10 seconds.": "Mise à jour toutes les 10 secondes.",
  "Failed to load voters": "Impossible de charger les votants",

  // Admin: draw game (tirage)
  "Draw game": "Tirage au sort",
  "Round {n}": "Tour {n}",
  "Draw a winner": "Tirer un gagnant",
  "Next round": "Tour suivant",
  "Drawing...": "Tirage…",
  "Winner of round {n}": "Gagnant du tour {n}",
  "Emails in the game": "E-mails en jeu",
  "Previous winners leave the game. Their votes still count.":
    "Les gagnants précédents sortent du jeu. Leurs votes comptent toujours.",
  "Winners": "Gagnants",
  "No winner yet.": "Aucun gagnant pour l'instant.",
  "Start over": "Recommencer",
  "Put every email back in the game?": "Remettre tous les e-mails en jeu ?",
  "Yes, start over": "Oui, recommencer",
  "Cancel": "Annuler",
  "No email left in the game.": "Plus aucun e-mail en jeu.",
  "Another draw is in progress. Try again.": "Un autre tirage est en cours. Réessayez.",
  "Failed to reach the draw": "Impossible de joindre le tirage",
  "Full screen": "Plein écran",
  "{n} in the game": "{n} en jeu",
};

export const t = (text, vars) => {
  const template = (LANG === "fr" && FR[text]) || text;
  return vars ? template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : template;
};
