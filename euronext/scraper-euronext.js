/**
 * Created by nicolas.urgin on 30/04/17.
 */

var fs = require('fs');
var superagent = require('superagent');
var cheerio = require('cheerio');
var async = require('async');
var moment = require('moment');
var mkdirp = require('mkdirp');

var $ = null;

// Configuration
moment.locale('fr');

// Constantes

var BASE_URL = 'https://www.euronext.com/';
var PATH_COMPOSANT_CAC_ALL_TRADABLE = '/fr/nyx-index-composition/ajax/index/FR0003999499-XPAR?ic_page=0';
var PATH_INTRADAY = '/sites/www.euronext.com/modules/common/common_listings/custom/nyx_eu_listings/nyx_eu_listings_price_chart/pricechart/pricechart.php';

var DATA_DIRECTORY = "./data";

var recovery = {composants: []};
var recovering = false;

// lancer le traitement
async.waterfall([
    // reprise sur panne : récupérer la liste des composants non traités lors de la précendente exécution
    function (callback) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        getRecoveryData(callback);
    },
    // récupérer la liste de composants de l'indice dont l'url est fournie en paramètre
    function (data, callback) {
        // s'il y a des données de reprise sur panne
        if (data) {
            // alors on récupère les données de recovery et on passe à l'étape suivante
            recovering = true;
            recovery = JSON.parse(JSON.stringify(data));
            callback(null, data);
        } else {
            // sinon on récupère les composants
            console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
            getCompositionList(BASE_URL + PATH_COMPOSANT_CAC_ALL_TRADABLE, data, callback);
        }
    },
    // récupérer les données intraday des composants
    function (data, callback) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        getIntradayData(data, callback);
    }
], function (err) {
    var recoveryFilePath = DATA_DIRECTORY + '/' + moment().format('YYYY-MM-DD') + '/recovery.json';

    if (err) {
        console.error('= = = = = = ERROR = = = = = = ERROR = = = = = = ERROR = = = = = =');
        console.log('Sauvegarde du fichier de reprise sur panne...');
        saveFile(recoveryFilePath, JSON.stringify(recovery, null, 2), function(error) {
            if (error)
                console.log('Erreur à la sauvegarde du fichier de reprise : ' + error);
            throw err;
        });

    } else if (recovering) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        console.log('Suppression du fichier de reprise sur panne...');
        removeFile(recoveryFilePath, function (error) {
            if (error)
                console.log('Erreur à la suppression du fichier de reprise : ' + error);
        });
    }
    console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
});

function getRecoveryData(callback) {
    var recoveryFilePath = DATA_DIRECTORY + '/' + moment().format('YYYY-MM-DD') + '/recovery.json';

    // récupérer le fichier de recovery s'il existe
    fs.readFile(recoveryFilePath, function (err, data) {
        if(err) {
            // si le fichier n'existe pas
            if(err.errno == -2 && err.code === 'ENOENT') {
                // alors appel callback vide
                console.log('No recovering data');
                return callback(null, null);
            } else {
                // sinon appel callback avec l'erreur
                return callback(err, null);
            }
        }
        // retourner les données quand il n'y a pas d'erreur
        console.log('Recovering data');
        callback(null, JSON.parse(data));
        // vérifier la taille des données
        if(data.length < 2) {
           console.log('Empty data :', data);
           callback(null, null);
        } else {
          console.log('Recovering data :', data);
          callback(null, JSON.parse(data));
        }
    });
}

/**
 * Récupérer les composants de l'url en paramètre.
 */
function getCompositionList(url, data, callback) {
    console.log('Récupération du contenu : ' + url);

    superagent
        .get(url)
        .end(function (error, response) {
            if (error) {
                callback(error);
            } else {
                var json = JSON.parse(response.text);
                data = getCompositionData(json.ic_div, data);
            }

            if (data.nextPagePath) {
                getCompositionList(BASE_URL + data.nextPagePath, data, callback);
            } else {
                 // sauvegarder la liste pour la reprise sur panne
                recovery = JSON.parse(JSON.stringify(data));
                callback(error, data);
            }
        });
}

/**
 * Récupérer les données des composants à partir du code html.
 */
function getCompositionData(div, data) {
    // charger le html
    $ = cheerio.load(div);

    var json = data ? data : {composants: []};

    // récupérer la liste des composants
    $('tr.odd, tr.even').each(function (index, element) {

        var tr = $(this);

        // récupérer les données du composant
        var titreComposant = tr.children().first();
        var isin = titreComposant.next();
        var tradingLocation = isin.next();

        var composant = {
            titre: titreComposant.text().trim(),
            isin: isin.text().trim(),
            tradingLocation: tradingLocation.text().trim()
        };

        json.composants.push(composant);
    });

    // récupérer l'url de la page suivante
    var nextPageListItem = $('li.pager-next');

    if (nextPageListItem) {
        json.nextPagePath = nextPageListItem.children().first().attr('href');
    } else {
        json.nextPagePath = undefined;
    }

    return json;
}

/**
 * Récupérer les données intraday des composants.
 */
function getIntradayData(compositionData, callback) {
    console.log('Récupération des données intraday du ' + moment().format('LL') + ' :');

    var timestamp = moment().startOf('day').format('x');
    let retryOptions = {
        times: 5,
        interval: 10000
    };

    let nbEssai;

    async.eachSeries(compositionData.composants, function (composant, eachSeriesCallback) {
      nbEssai = 0;
        async.retry(retryOptions, function (retryCallback) {
          console.log(composant.titre, nbEssai++ > 0 ? `(essai ${nbEssai})` : '');
          superagent
            .get(BASE_URL + PATH_INTRADAY)
            .query({
              q: 'intraday_data',
              from: timestamp,
              isin: composant.isin,
              mic: 'XPAR',
              dateFormat: 'd/m/Y',
              locale: 'null'
            })
            .end(function (error, response) {
              if (error) {
                console.log('error');
                retryCallback(error);
              } else {
                saveIntradayData(composant, JSON.parse(response.text), retryCallback);
              }
            });
        }, function (error) {
            eachSeriesCallback(error);
        });
    }, function (error) {
        callback(error);
    });
}

/**
 *
 */
function saveIntradayData(composant, intradayData, callback) {
    var saveDirectory = DATA_DIRECTORY + '/' + moment().format('YYYY-MM-DD');
    var filepath = saveDirectory + '/' + composant.isin + '.json';

    var writeFile = function () {
        fs.writeFile(filepath, JSON.stringify(intradayData, null, 2), function (error) {
            if(!error)
                recovery.composants.shift();
            callback(error);
        });
    };

    fs.exists(filepath, function (exists) {
        if (!exists) {
            mkdirp(saveDirectory, function (error) {
                if (error) {
                    callback(error);
                } else {
                    writeFile();
                }
            });
        } else {
            writeFile();
        }
    });
}

function readFile(filepath, callback) {
    fs.readFile(filepath, function (error, data) {
        callback(error, data);
    });
}

function saveFile(filepath, content, callback) {
    fs.writeFile(filepath, content, function (error) {
        callback(error);
    });
}

function removeFile(filepath, callback) {
    fs.unlink(filepath, function (error) {
        callback(error);
    });
}
