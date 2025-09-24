  const express = require('express');
  const axios = require('axios');
  const bcrypt = require('bcrypt');
  const bodyParser = require('body-parser');
  const path = require('path');
  const dotenv = require('dotenv');
  const session = require('express-session');
  const validator = require('validator');
  const sql = require('mssql');
  const { error } = require('console');
  var router = express.Router();
  dotenv.config();

  const app = express();

  // Configurer le moteur de template EJS
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Middleware
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname)));

  // Middleware express-sessions
  app.use(session({
    secret: 'votre_clé_secrète', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
  }));
  const noCache = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  };

  // Route pour afficher le formulaire
  app.get('/', (req, res) => {
      res.render('index', { errors: [] });
  });
  app.get('/nouveaupatient', (req, res) => {
      try{
            axios.get(process.env.URL_WEBSERVICE+'ExecStoredProc/InsertPatient/'+encodeURIComponent("@nom;@prenom;@email;@date_naissance;@mot_de_passe=;@Result=1"
                ), {
              headers: {
                'Authorization': `Basic `+btoa(process.env.SQL_USER+':'+process.env.SQL_PASSWORD)
              }
            })
          }
        catch(error){
          //  console.log("Erreur :", error);
        }
      res.render('index', { errors: [] });
  });


  // Route pour traiter l'inscription

  app.post('/register', async (req, res) => {
      const { nom, prenom, date_naissance, email, mot_de_passe } = req.body;
      const errors = [];

      // Validation des entrées
      if (!nom || nom.length > 50) {
          errors.push('Le nom est requis et doit être inférieur à 50 caractères.');
      }
      if (!prenom || prenom.length > 50) {
          errors.push('Le prénom est requis et doit être inférieur à 50 caractères.');
      }
      if (!date_naissance || !/^\d{4}-\d{2}-\d{2}$/.test(date_naissance)) {
          errors.push('La date de naissance doit être au format YYYY-MM-DD.');
      } else {
          const date = new Date(date_naissance);
          const now = new Date();
          if (isNaN(date) || date > now) {
              errors.push('La date de naissance est invalide ou dans le futur.');
          }
      }
      if (!email || !validator.isEmail(email)) {
          errors.push("L'email est invalide.");
      }
      if (!mot_de_passe || mot_de_passe.length < 8) {
          errors.push('Le mot de passe doit avoir au moins 8 caractères.');
      }

      if (errors.length > 0) {
          return res.render('register', { errors });
      }

      try {
          // Uniformisation de l'encodage de l'en-tête Authorization
          const authHeader = `Basic ${Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')}`;

          // console.log('URL appelée pour InsertPatient:', `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertPatient`);
          console.log('Données envoyées à InsertPatient:', {
              nom,
              prenom: prenom.trim(),
              email: validator.normalizeEmail(email),
              date_naissance,
              mot_de_passe
          });
        
          // Insérer le patient 
        const insert = `@nom=${nom};@prenom=${prenom};@date_naissance=${date_naissance};@email=${email};@mot_de_passe=${mot_de_passe};@Result=1`;
        //  console.log('URL complète:', `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertPatient/${encodeURIComponent(insert)}`);
      const patientResponse = await axios.get(
      `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertPatient/${encodeURIComponent(insert)}`,
      {
          headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
  );
          return res.redirect('/connexion');
      } catch (error) {
          console.error('Erreur d\'inscription:', {
              message: error.message,
              stack: error.stack,
              code: error.code,
              status: error.response?.status,
              responseData: error.response?.data || 'Aucune donnée de réponse',
              headers: error.response?.headers
          });
          let errorMessage = 'Erreur lors de la création du patient.';
          if (error.response?.status === 500) {
              errorMessage = error.response?.data?.error || 'Erreur interne du serveur';
          } else if (error.response?.status === 404) {
              errorMessage = 'Méthode ou endpoint non trouvé sur le serveur.';
          } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
              errorMessage = 'Le service web est injoignable.';
          } else if (error.response?.status === 401) {
              errorMessage = 'Échec de l\'authentification : identifiants incorrects.';
          }
          errors.push(errorMessage);
          return res.render('connexion', { errors }); 
      }
  });

  // Route pour la page succès
  app.get('/inscription_reussie', (req, res) => {
      res.render('inscription_reussie');
  });

  // Route pour la page de connexion 
  app.get('/connexion', async(req, res) => {
      res.render('connexion');
  });

  // Constantes pour les messages d'erreur
  const ERROR_MESSAGES = {
    INVALID_EMAIL: 'L\'email est invalide',
    MISSING_PASSWORD: 'Le mot de passe est requis',
    USER_NOT_FOUND: 'Email non trouvé',
    INVALID_PASSWORD: 'Mot de passe incorrect',
    WEBSERVICE_UNREACHABLE: 'Impossible de contacter le service d\'authentification',
    SERVER_ERROR: 'Erreur serveur interne',
    UNEXPECTED_RESPONSE: 'Réponse inattendue du service'
  };

  
  // Route pour la page dashboard
  app.get('/dashboard', noCache, async (req, res) => {
      // Vérifier si l'utilisateur est authentifié
    if (!req.session.id_demandeur) {
      return res.redirect('/connexion');
    }
    let demandes = [];
    let errors = [];
    try {
      const params = `@id_demandeur=${req.session.id_demandeur}`;
      const encodedParams = encodeURIComponent(params);
      const apiUrl = `${process.env.URL_WEBSERVICE}ExecStoredProc/GetDemandesByDemandeur/${encodedParams}`;
      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')}`
        }
      });
     demandes = Array.isArray(response.data) ? response.data : response.data.result || [];
  } catch (err) {
    console.error('Erreur lors de la récupération des demandes:', err);
    errors.push('Erreur lors de la récupération des demandes. Veuillez réessayer plus tard.');

    demandes = [];
  }

  res.render('dashboard', {
        Settings: {
          email: req.session.email,
          userName: 'Utilisateur',
          role: 10,
          locationID: 1,
          roleName: 'Utilisateur',
          locationName: 'Hôpital Principal',
          id_demandeur: req.session.id_demandeur
        },
        demandes: demandes, 
        errors: errors
      });
  });
  // Route pour traiter la connexion
  app.post('/submit-login', async (req, res) => {
    const { email = '', mot_de_passe = '' } = req.body;
    const errors = [];

    if (!email || !validator.isEmail(email)) {
      errors.push(ERROR_MESSAGES.INVALID_EMAIL);
    }
    if (!mot_de_passe || mot_de_passe.length < 8) {
      errors.push(ERROR_MESSAGES.MISSING_PASSWORD);
    }

    if (errors.length > 0) {
      return res.render('connexion', { errors });
    }

    try {
      const webServiceUrl = `${process.env.URL_WEBSERVICE}ExecStoredProc/CheckUserLogin/${encodeURIComponent(`@email=${email};@mot_de_passe=${mot_de_passe}`)}`;
      const response = await axios.get(webServiceUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });

  
      const result = response.data?.result;
      if (!result || !Array.isArray(result) || result.length === 0) {
        errors.push(ERROR_MESSAGES.USER_NOT_FOUND);
        return res.render('connexion', { errors });
      }

      // Extraction de l'utilisateur
      const user = Array.isArray(result[0]) ? result[0][0] : result[0];
      if (!user || (!user.id && !user.id_demandeur)) {
        errors.push(ERROR_MESSAGES.USER_NOT_FOUND);
        return res.render('connexion', { errors });
      }
      
      // Définir id_demandeur avec user.id ou user.id_demandeur
      const id_demandeur = user.id_demandeur || user.id;

      req.session.regenerate((err) => {
        if (err) {
          errors.push('Erreur de session');
          return res.render('connexion', { errors });
        }
        req.session.user = {
          email: validator.normalizeEmail(email),
          nom: user.Nom || '',
          prenom: user.Prenom || '',
        };
        req.session.patientId = user.id || user.id_demandeur;
        req.session.email = user.email;
        req.session.id_demandeur = id_demandeur; 
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
        return res.redirect('/dashboard');
      });
    } catch (err) {
      console.error('Erreur lors de la connexion :', {
        message: err.message,
        status: err.response?.status,
        responseData: err.response?.data || 'Aucune donnée de réponse',
      });
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errors.push(ERROR_MESSAGES.WEBSERVICE_UNREACHABLE);
      } else if (err.response?.status === 401) {
        errors.push('Échec de l\'authentification : identifiants incorrects ou méthode HTTP non supportée');
      } else if (err.response?.status >= 500) {
        errors.push(`Erreur serveur : ${err.response?.data?.error || 'Erreur interne du serveur'}`);
      } else {
        errors.push(`Erreur : ${err.message}`);
      }
      return res.render('connexion', { errors });
    }
  });


  app.post('/changeDBValues', async (req, res) => {
      try {
          const reference = req.body.reference;
          const demande_id = req.body.Demande_id;
          const commentaire = req.body.commentaire;
          const nom_demandeur = req.body.nomDemandeur;
          const prenomDemandeur = req.body.prenomDemandeur;
          const NomDestinataire = req.body.NomDestinataire;
          const PrenomDestinataire = req.body.PrenomDestinataire;
          const typeDemandeur = req.body.typeDemandeur;
          const motifs = req.body.motifs;
          const Adresse = req.body.Adresse;
          const CodePostal = req.body.CodePostal;
          const Ville = req.body.Ville;
          const Email = req.body.Email;
          const nomNaissance = req.body.nomNaissance;
          const prenomNaissance = req.body.prenomNaissance;
          const ddnNaissance = req.body.ddnNaissance;
          if (!reference) {
              return res.status(400).json({ error: 'Le champ reference ou demandID est requis.' });
          }
          if (typeof commentaire === 'undefined') {
              return res.status(400).json({ error: 'Le champ COMMENTAIRE est requis.' });
          }
          // Met à jour les champs NOTES (commentaire), Nom demandeur, Nom de naissance, Prénom et DDN du patient
          const response = await axios.get(process.env.URL_WEBSERVICE +
            'changeDBValues/DEMANDE_PATIENT/' +
            encodeURIComponent("PRENOM_DEMANDEUR='"+prenomDemandeur.replace(/'/g, "''")+"',DESTINATAIRE='"+NomDestinataire.replace(/'/g, "''")+"',NOM_NAISSANCE='"+nomNaissance.replace(/'/g, "''")+"',PRENOM='"+prenomNaissance.replace(/'/g, "''")+"',DDN_PATIENT='"+ddnNaissance.replace(/'/g, "''")+"',DEMANDEUR_ADR='"+Adresse.replace(/'/g, "''")+"',DEMANDEUR_CP='"+CodePostal.replace(/'/g, "''")+"',DEMANDEUR_VILLE='"+Ville.replace(/'/g, "''")+"',MAIL_DEMANDEUR='"+Email.replace(/'/g, "''")+"',PROFIL_ID='"+typeDemandeur.replace(/'/g, "''")+"',PRENOM_DESTINATAIRE='"+PrenomDestinataire.replace(/'/g, "''")+"',NOTES='"+commentaire.replace(/'/g, "''")+"',NOM_DEMANDEUR='"+nom_demandeur.replace(/'/g, "''")) + "'/" +
            encodeURIComponent(
              "demand_id=" + reference 
            )
            , {
              headers: {
                'Authorization': 'Basic ' + Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')
              }
          });

        await axios.get(
              `${process.env.URL_WEBSERVICE}deleteFromDB/MOTIF_E_DEMANDE/` +
              encodeURIComponent(`DEMAND_ID=${reference || demande_id}`),
              {
                  headers: {
                      'Authorization': 'Basic ' + Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')
                  }
              }
          );


        for (const motifId of motifs) {
          const requeteMotif = `@table=MOTIF_E_DEMANDE;@fields=MOTIF_ID,DEMAND_ID;@values=${motifId},${reference}`;
              await axios.get(
                `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertWithIdentity/${encodeURIComponent(requeteMotif)}`,
                  {
                      headers: {
                          'Authorization': 'Basic ' + Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')
                      }
                  }
              );
          }
          
          res.json(response.data);
      } catch (err) {
          console.error('Erreur lors de la mise à jour du commentaire:', {
              message: err.message,
              status: err.response?.status,
              responseData: err.response?.data || 'Aucune donnée de réponse',
              headers: err.response?.headers
          });
          res.status(500).json({ error: `Erreur lors de la mise à jour : ${err.response?.data?.error || err.message}` });
      }
  });


  app.post('/createDemande', async (req, res) => {

  try {

  const {
        dateDemande,
        nomPatient,
        prenomPatient,
        ddnPatient,
        nomDemandeur,
        prenomDemandeur,
        selectedMotifs,
        lienAvecPatient,
        dateSouhaitee,
        nomDestinataire,
        prenomDestinataire,
        adresseDestinataire,
        codePostalDestinataire,
        villeDestinataire,
        emailDestinataire,
        commentaire,
        typeDemandeur,
        piecesDemandees,
        dateDebutSejour,
        dateFinSejour

      } = req.body;
    var fields = "";
    var values = "";
    if (!req.session.id_demandeur) {
        // console.error('Erreur : id_demandeur est indéfini. L\'utilisateur n\'est peut-être pas authentifié.');
        return res.status(401).json({ error: 'Utilisateur non authentifié. Veuillez vous connecter.' });
      }
      if (typeof dateDemande != 'undefined') {
          if (dateDemande != "") {
            fields = fields+",DEMAND_DATE";
            values =values+ ",'"+dateDemande.replace(/'/g, "''")+"'";
          }
        }
    
      if (typeof nomDemandeur != 'undefined') {
          if (nomDemandeur != "") {
            fields = fields+",NOM_DEMANDEUR";
            values = values+",'"+nomDemandeur.replace(/'/g, "''")+"'";
          }
        }
        if (typeof prenomDemandeur != 'undefined') {
          if (prenomDemandeur != "") {
            fields = fields+",PRENOM_DEMANDEUR";
            values = values+",'"+prenomDemandeur.replace(/'/g, "''")+"'";
          }
        }
      if (typeof lienAvecPatient != 'undefined') {
          const lienId = Number(lienAvecPatient);
          if (!isNaN(lienId)) {
          fields = fields + ",LIEN_ID";
          values = values + "," + lienId; 
      }
        }

        if (typeof typeDemandeur != 'undefined') {
          const typeId = Number(typeDemandeur);
          if (!isNaN(typeId)) {
            fields = fields+",PROFIL_ID";
            values = values+","+typeId;
          }
        } 
        if (typeof emailDestinataire != 'undefined') {
          if (emailDestinataire != "") {
            fields = fields+",MAIL_DEMANDEUR";
            values = values+",'"+emailDestinataire.replace(/'/g, "''")+"'";
          }
        }
        if (typeof commentaire != 'undefined') {
          if (commentaire != "") {
            fields = fields+",NOTES";
            values = values+",'"+commentaire.replace(/'/g, "''")+"'";
          }
        }
        if (typeof codePostalDestinataire != 'undefined') {
          if (codePostalDestinataire != "") {
            fields = fields+",DEMANDEUR_CP";
            values = values+",'"+codePostalDestinataire.replace(/'/g, "''")+"'";
          }
        }
        if (typeof villeDestinataire != 'undefined') {
          if (villeDestinataire != "") {
            fields = fields+",DEMANDEUR_VILLE";
            values = values+",'"+villeDestinataire.replace(/'/g, "''")+"'";
          }
        }
        if (typeof adresseDestinataire != 'undefined') {
          if (adresseDestinataire != "") {
            fields = fields+",DEMANDEUR_ADR";
            values = values+",'"+adresseDestinataire.replace(/'/g, "''")+"'";
          }
        }
        if (typeof dateSouhaitee != 'undefined') {
          if (dateSouhaitee != "") {
            fields = fields+",DATE_SOUHAITEE";
            values = values+",'"+dateSouhaitee.replace(/'/g, "''")+"'";
          }
        }
      
        if (typeof ddnPatient != 'undefined') {
            if (ddnPatient != "") {
              fields = fields+",DDN_PATIENT";
              values = values+",'"+ddnPatient.replace(/'/g, "''")+"'";
            }
          }
        if (typeof prenomPatient != 'undefined') {
            if (prenomPatient != "") {
              fields = fields+",PRENOM";
              values = values+",'"+prenomPatient.replace(/'/g, "''")+"'";
            }
          } 
      if (typeof nomPatient != 'undefined') {
          if (nomPatient != "") {
              fields = fields+",NOM_NAISSANCE";
              values =values+ ",'"+nomPatient.replace(/'/g, "''")+"'";
          }
      }
      if (typeof nomDestinataire != 'undefined') {
          if (nomDestinataire != "") {
              fields = fields+",DESTINATAIRE";
              values =values+ ",'"+nomDestinataire.replace(/'/g, "''")+"'";
          }
      }
      if (typeof prenomDestinataire != 'undefined') {
          if (prenomDestinataire != "") {
              fields = fields+",PRENOM_DESTINATAIRE";
              values =values+ ",'"+prenomDestinataire.replace(/'/g, "''")+"'";
          }
      }

      //mettre la demande à l'état en attente de traitement

        fields = fields+",AVANCEMENT_ID";
        values = values+",1";
        fields = fields+",IS_HIDDEN";
        values = values+",0";

      fields = fields.substring(1);
      values = values.substring(1);
      // Requête SQL
      //insertion dans la table DEMANDE_PATIENT
      const requete = `@table=DEMANDE_PATIENT;@fields=${fields};@values=${values}`;
        var id_demande=null;
      // console.log(`${process.env.URL_WEBSERVICE}ExecStoredProc/InsertWithIdentity/${encodeURIComponent(requete)}`);
      const response = await axios.get(
        `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertWithIdentity/${encodeURIComponent(requete)}`,
        {
          headers: {
            Authorization: `Basic ${btoa(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`)}`,
          },
        }
      );
    id_demande = response.data.result[0][2].complement;
          
    // Insertion dans la table DEMANDE_USERS
        if (id_demande) {
              const requete2 = `@id_demande=${id_demande};@id_demandeurs=${req.session.id_demandeur}`;
              await axios.get(
                `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertDemandeUsers/${encodeURIComponent(requete2)}`,
                {
                  headers: { 
                    Authorization: `Basic ${btoa(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`)}`,
                  },
                }
              );
            }
        // Suppression des motifs existants pour cette demande
        if (id_demande) {
          await axios.get(
            `${process.env.URL_WEBSERVICE}deleteFromDB/MOTIF_E_DEMANDE/DEMAND_ID=${id_demande}`,
            {
              headers: {
                Authorization: `Basic ${btoa(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`)}`,
              },
            }
          );
        // Insertion des nouveaux motifs
        if (selectedMotifs && Array.isArray(selectedMotifs)) {
          for (const motifId of selectedMotifs) {
            const requeteMotif = `@table=MOTIF_E_DEMANDE;@fields=MOTIF_ID,DEMAND_ID;@values=${motifId},${id_demande}`;
            await axios.get(
              `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertWithIdentity/${encodeURIComponent(requeteMotif)}`,
              {
                headers: {
                  Authorization: `Basic ${btoa(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`)}`,
                },
              }
            );
          }
        }
      }
      // Insertion dans la table SEJOUR_DEMANDE
      if (id_demande) {
        const sejourFields = ['SEJOUR_DEBUT', 'SEJOUR_FIN', 'DEMAND_ID', 'VISIT_ID', 'LOCATION_ID', 'UF', 'AVSEJOUR_ID', 'MAIL_UF', 'COURRIER'];

        const sejourValues = [`'${dateDebutSejour}'`, `'${dateFinSejour}'`, id_demande, 'NULL', 'NULL', "'Non renseigné'", 'NULL', 'NULL', 'NULL'];
        const requeteSejour = `@table=SEJOUR_DEMANDE;@fields=${sejourFields.join(',')};@values=${sejourValues.join(',')}`;

        await axios.get(
          `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertWithIdentity/${encodeURIComponent(requeteSejour)}`,
          {
            headers: {
              Authorization: `Basic ${btoa(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`)}`,
            },
          }
        );
      } else {
          console.warn('Insertion dans SEJOUR_DEMANDE ignorée : id_demande est indéfini');
          }
      //Insertion des pièces demandées
      if (piecesDemandees && Array.isArray(piecesDemandees)) {
        for (const pieceId of piecesDemandees) {
          const requetePiece = `@table=DEMANDE_PIECE;@fields=PIECE_ID,DEMAND_ID;@values=${pieceId},${id_demande}`;
          await axios.get(
            `${process.env.URL_WEBSERVICE}ExecStoredProc/InsertWithIdentity/${encodeURIComponent(requetePiece)}`,
              {
                headers: {
                  Authorization: `Basic ${btoa(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`)}`,
                },
              }
            );
          }
        }
      res.json(response.data);
    } catch (error) {
    console.error('Erreur lors de la création de la demande :', {
        message: error.message,
        status: error.response?.status,
        responseData: error.response?.data || 'Aucune donnée de réponse',
      });
      return res.status(500).json({
        error: `Erreur lors de la création de la demande : ${error.response?.data?.error || error.message}`,
      });
    }
  });

app.post('/hideDemande', noCache, async (req, res) => {
    try {
        const { id_demande } = req.body;
        const params = `@DEMAND_ID=${id_demande}`;
        const encodedParams = encodeURIComponent(params);
        const apiUrl = `${process.env.URL_WEBSERVICE}ExecStoredProc/HideDemande/${encodedParams}`;
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.SQL_USER}:${process.env.SQL_PASSWORD}`).toString('base64')}`
            }
        });
        if (response.data && response.data[0] && response.data[0].some(item => item.success === 'False')) {
            throw new Error(response.data[0].find(item => item.reason)?.reason || 'Erreur API inconnue');
        }
        const message = response.data[0] && response.data[0][0]?.Message || 'Demande masquée avec succès.';
        return res.status(200).json({ message });
    } catch (error) {
        console.error('Erreur lors du masquage de la demande :', error.message);
        return res.status(500).json({ error: `Erreur lors du masquage de la demande : ${error.message}` });
    }
});

  // Route pour la déconnexion
  app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        // console.error('Erreur lors de la déconnexion:', err);
        return res.status(500).send('Erreur serveur');
      }
      res.redirect('/connexion'); 
    });
  });

  // Démarrer le serveur
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
      console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });