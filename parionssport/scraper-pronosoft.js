/**
 * Created by nicolas.urgin on 01/03/15.
 */

var fs = require('fs');
var superagent = require('superagent-charset');
var cheerio = require('cheerio');
var async = require('async');

var $ = null;

// Configuration

// Constantes

var BASE_URL = 'http://www.pronosoft.com/';
var URL_GRILLE = '/fr/lotofoot/livescore.php';
var URL_RESULTAT = '/fr/lotofoot/resultats-et-rapports.php';

var DATA_DIRECTORY = "./data";
var GRILLE_DIRECTORY = "./grille";
var RESULTAT_DIRECTORY = "./resultat";

var REGEXP_LF7 = /^Loto Foot 7 n°(\d{1,3})$/i;
var REGEXP_LF7_LF15 = /^Loto Foot 7 n°(\d{1,3}) - Loto Foot 15 n°(\d{1,3})/i;

// lancer le traitement
async.waterfall([
    function (callback) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        callback(null);
    },
    // récupérer le contenu html de la page contenant les grilles
    function (callback) {
        getHtmlFromUrl(BASE_URL + URL_GRILLE, callback);
    },
    // récupérer les données des grilles de lotofoot à partir du contenu html
    function (html, callback) {
        getLotoFootData(html, callback);
    },
    // sauvegarder les données récupérées
    function (lotoFootData, callback) {
        saveLotoFootData(lotoFootData, GRILLE_DIRECTORY, callback);
    },
    // récupérer le contenu html de la page contenant les résultats
    function (callback) {
        getHtmlFromUrl(BASE_URL + URL_RESULTAT, callback);
    },
    // récupérer les données des grilles de lotofoot à partir du contenu html
    function (html, callback) {
        getLotoFootData(html, callback);
    },
    // sauvegarder les données récupérées
    function (lotoFootData, callback) {
        saveLotoFootData(lotoFootData, RESULTAT_DIRECTORY, callback);
    }
], function (err, result) {
    // result now equals 'done'
    if (err) {
        console.error('= = = = = = ERROR = = = = = = ERROR = = = = = = ERROR = = = = = =');
        //console.error(err);
        throw err;
    }
    console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
});

/**
 * Récupérer le contenu html de l'url en paramètre.
 */
function getHtmlFromUrl(url, callback) {
    console.log('Récupération du contenu html : ' + url);
    /*request(url, function (error, response, html) {
     callback(error, html);
     });*/
    superagent
        .get(url)
        .charset('iso-8859-15')
        .end(function (error, response) {
            callback(error, response.text);
        });
}

/**
 * Récupérer les données des grilles lotofoot à partir du contenu html.
 */
function getLotoFootData(html, callback) {
    console.log('Récupération des données des grilles ...');

    // charger le html
    $ = cheerio.load(html);

    var json = {grilles: []};

    $('h2').each(function (index, element) {

        var h2 = $(this);

        // récupérer le titre la grille
        var titreGrille = h2.text().trim();

        // récupérer le tableau des matches
        var matchesTable = h2.next();

        // récupérer la date de validation
        var validationDateStr = matchesTable.children().first().text().trim();

        // aggréger les données de la grille
        var grille = {
            titre: titreGrille,
            validationDate: validationDateStr,
            matches: [],
            rapports: []
        };

        // récupérer les matches à partir du tableau
        var matchesTableRow = matchesTable.children().first().next().children();

        // récupérer les données pour chaque match
        matchesTableRow.each(function (index, element) {
            var matchTableRow = $(this);
            var text = matchTableRow.text().trim();

            // récupérer le numéro du match
            var matchNumberCell = matchTableRow.children().first();
            var matchNumber = matchNumberCell.text().trim();

            // récupérer la date de début du match
            var matchStartDateCell = matchNumberCell.next().next();
            var matchStartDateStr = matchStartDateCell.text().trim();

            // récupérer l'équipe à domicile
            var homeTeamCell = matchStartDateCell.next();
            var homeTeam = homeTeamCell.text().trim();

            // récupérer le score du match
            var scoreCell = homeTeamCell.next();
            var score = scoreCell.text().trim();

            // récupérer l'équipe à l'extérieur
            var visitorTeamCell = scoreCell.next();
            var visitorTeam = visitorTeamCell.text().trim();

            // récupérer le résultat du match (1/N/2)
            var scoreFinalCell = visitorTeamCell.next();
            var scoreFinal = scoreFinalCell.text().trim();

            var matchData = {
                matchNumber: matchNumber,
                matchStartDate: matchStartDateStr,
                homeTeam: homeTeam,
                visitorTeam: visitorTeam,
                score: score,
                scoreFinal: scoreFinal
            };

            grille.matches.push(matchData);
            //console.log(JSON.stringify(matchData, null, 2));
        });

        // récupérer les rapports
        var tableauRapports = matchesTable.parent().next().children();

        // récupérer les données pour chaque rapport
        tableauRapports.each(function (index, element) {
            var divRapport = $(this);

            var rapport = {
                titre: divRapport.children().first().text().trim(),
                lignes: []
            };

            var rapportTableRows = divRapport.children().first().next().children().first().children();

            rapportTableRows.each(function (index, element) {
                var row = $(this);

                var rangCell = row.children().first();
                var rang = rangCell.text().trim();

                var nbGangantCell = rangCell.next();
                var nbGagnant = nbGangantCell.text().trim();

                var estimationOuRapportCell = nbGangantCell.next();
                var estimationOuRapport = estimationOuRapportCell.text().trim();

                var ligneRapport = {
                    rang: rang,
                    gagnant: nbGagnant,
                    estimationOuRapport: estimationOuRapport
                };

                rapport.lignes.push(ligneRapport);
            });

            grille.rapports.push(rapport);
        });

        json.grilles.push(grille);
    });

    callback(null, json);
}

/**
 *
 */
function saveLotoFootData(lotoFootData, saveDirectory, callback) {

    async.eachSeries(lotoFootData.grilles, function (grille, callback2) {

        var filename = null;

        if (REGEXP_LF7.test(grille.titre)) {
            grille.lf7 = RegExp.$1;
            filename = 'LF7-' + grille.lf7;
        }

        if (REGEXP_LF7_LF15.test(grille.titre)) {
            grille.lf7 = RegExp.$1;
            grille.lf15 = RegExp.$2;
            filename = 'LF7-' + grille.lf7 + '_LF15-' + grille.lf15;
        }

        var filepath = saveDirectory + '/' + filename + '.json';

        fs.exists(filepath, function (exists) {
            if (!exists) {
                fs.mkdir(saveDirectory, function (error) {
                    fs.writeFile(filepath, JSON.stringify(grille, null, 2), function (error) {
                        if (error) {
                            callback(error);
                        }
                        callback2();
                    });
                });
            } else {
                callback2();
            }
        });
    }, callback);
}